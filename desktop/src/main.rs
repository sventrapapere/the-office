// The Office — guscio desktop della dashboard.
//
// L'app non incorpora la dashboard: la legge dal vault a ogni avvio, così
// `_dashboard/index.html` si modifica come prima e basta ricaricare (F5).
//
// Tutto passa da un protocollo interno, senza porte di rete:
//   http://office.localhost/<percorso>          file del vault (la pagina è /_dashboard/index.html)
//   http://office.localhost/_api/ping           nome del vault, versione
//   http://office.localhost/_api/list?skip=a|b  tutte le note .md con testo e data
//   GET/PUT/DELETE /_api/file?path=...          legge / scrive / cestina un file del vault (DELETE dalla 2.0)
//   http://office.localhost/_api/changes        contatore che sale quando cambia qualcosa nel vault
//   http://office.localhost/_api/find?name=x.jpg trova un file per nome ovunque nel vault (allegati)
//   http://office.localhost/_api/open?url=...   apre un link obsidian:// o web fuori dall'app
//   POST /_api/window?do=minimize|maximize|close|drag   pulsanti e trascinamento della barra del titolo disegnata dalla pagina (dalla 2.1)
//   http://office.localhost/_api/chat-status    se la chat con Claude Code è attiva
//   http://office.localhost/_api/sync-status    stato delle cartelle sincronizzate (vedi src/sync.rs)
//   http://office.localhost/_api/open-source?pair=Kit%20MESBG&rel=...  apre un file/cartella della sorgente (PDF, 3D…)
// (su Linux/macOS lo stesso indirizzo è office://localhost/...)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod chat;
mod sync;

use std::{
    fs,
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::UNIX_EPOCH,
};

use tauri::{
    http::{Request, Response},
    Manager, WebviewUrl, WebviewWindowBuilder,
};

pub struct St {
    pub vault: PathBuf,
    pub changes: AtomicU64,
    pub chat: Arc<chat::ChatState>,
    pub sync: Arc<sync::SyncState>,
}

const VERSION: &str = env!("CARGO_PKG_VERSION");

fn main() {
    let vault = find_vault();
    let chat_state = Arc::new(chat::ChatState::default());
    let st = Arc::new(St {
        vault: vault.clone(),
        changes: AtomicU64::new(1),
        chat: chat_state.clone(),
        sync: Arc::new(sync::SyncState::default()),
    });

    if vault.is_dir() {
        start_watcher(st.clone());
        chat::start(vault.clone(), chat_state);
        sync::start(vault.clone(), st.sync.clone());
    }

    let proto_st = st.clone();
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .register_asynchronous_uri_scheme_protocol("office", move |ctx, req, responder| {
            let st = proto_st.clone();
            // la finestra si comanda subito (il trascinamento va avviato finché il tasto del mouse è ancora premuto)
            if req.uri().path() == "/_api/window" {
                let app = ctx.app_handle().clone();
                responder.respond(window_cmd(&app, &req));
                return;
            }
            std::thread::spawn(move || responder.respond(handle(&st, req)));
        })
        .setup(|app| {
            let start = if cfg!(any(windows, target_os = "android")) {
                "http://office.localhost/_dashboard/index.html"
            } else {
                "office://localhost/_dashboard/index.html"
            };
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(start.parse().unwrap()))
                .title("The Office")
                .inner_size(1440.0, 920.0)
                .min_inner_size(720.0, 520.0)
                // niente cornice di Windows: la barra del titolo la disegna la pagina (dalla 2.1);
                // l'ombra tiene bordi per ridimensionare e angoli arrotondati
                .decorations(false)
                .shadow(true)
                .background_color(tauri::window::Color(11, 11, 12, 255))
                .center()
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("errore all'avvio di The Office");
}

/* ───────────── barra del titolo ───────────── */

fn window_cmd(app: &tauri::AppHandle, req: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let q = query(req);
    let Some(w) = app.get_webview_window("main") else { return text(404, "finestra non trovata") };
    let r = match qget(&q, "do").unwrap_or("") {
        "minimize" => w.minimize(),
        "maximize" => if w.is_maximized().unwrap_or(false) { w.unmaximize() } else { w.maximize() },
        "close" => w.close(),
        "drag" => w.start_dragging(),
        "state" => Ok(()),
        _ => return text(400, "comando sconosciuto"),
    };
    match r {
        Ok(()) => json(200, serde_json::json!({ "ok": true, "maximized": w.is_maximized().unwrap_or(false) })),
        Err(e) => text(500, &format!("{e}")),
    }
}

/* ───────────── dove sta il vault ───────────── */

pub fn app_data_dir() -> Option<PathBuf> {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))
        .map(|p| p.join("TheOffice"))
}

fn find_vault() -> PathBuf {
    if let Some(v) = std::env::var_os("THE_OFFICE_VAULT") {
        return PathBuf::from(v);
    }
    if let Some(cfg) = app_data_dir().map(|d| d.join("config.json")) {
        if let Ok(t) = fs::read_to_string(&cfg) {
            if let Ok(j) = serde_json::from_str::<serde_json::Value>(t.trim_start_matches('\u{feff}')) {
                if let Some(v) = j["vault"].as_str() {
                    return PathBuf::from(v);
                }
            }
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        for a in exe.ancestors() {
            if a.join(".obsidian").is_dir() {
                return a.to_path_buf();
            }
        }
    }
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")).unwrap_or_default();
    PathBuf::from(home).join("My Drive").join("Obsidian").join("GONDISHAPUR")
}

pub fn safe_join_pub(root: &Path, rel: &str) -> Option<PathBuf> {
    safe_join(root, rel)
}

/// Unisce un percorso relativo ("04 Checklist/Checklist.md") alla radice del vault,
/// rifiutando tutto ciò che potrebbe uscirne.
fn safe_join(root: &Path, rel: &str) -> Option<PathBuf> {
    let rel = rel.trim_start_matches('/');
    if rel.is_empty() || rel.contains(':') || rel.contains('\\') {
        return None;
    }
    let mut p = root.to_path_buf();
    for c in Path::new(rel).components() {
        match c {
            Component::Normal(s) => p.push(s),
            Component::CurDir => {}
            _ => return None,
        }
    }
    Some(p)
}

/* ───────────── watcher del vault ───────────── */

fn start_watcher(st: Arc<St>) {
    use notify::{RecursiveMode, Watcher};
    let root = st.vault.clone();
    let cb_st = st.clone();
    let res = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(ev) = res else { return };
        if matches!(ev.kind, notify::EventKind::Access(_)) {
            return;
        }
        let relevant = ev.paths.iter().any(|p| {
            let Ok(rel) = p.strip_prefix(&cb_st.vault) else { return false };
            let mut comps = rel.components();
            match comps.next() {
                Some(Component::Normal(first)) => {
                    let f = first.to_string_lossy();
                    // .obsidian scrive di continuo, _dashboard è roba dell'app
                    !(f.starts_with('.') || f == "_dashboard" || f.ends_with(".tmp") || f == "desktop.ini")
                        && !rel.to_string_lossy().ends_with(".office-tmp")
                }
                _ => false,
            }
        });
        if relevant {
            cb_st.changes.fetch_add(1, Ordering::SeqCst);
        }
    });
    match res {
        Ok(mut w) => {
            if w.watch(&root, RecursiveMode::Recursive).is_ok() {
                std::mem::forget(w); // resta acceso per tutta la vita dell'app
            }
        }
        Err(e) => chat::log(&format!("watcher non avviato: {e}")),
    }
}

/* ───────────── richieste ───────────── */

fn resp(status: u16, ctype: &str, body: Vec<u8>) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header("Content-Type", ctype)
        .header("Cache-Control", "no-store")
        .header("Access-Control-Allow-Origin", "*")
        .body(body)
        .unwrap()
}
fn json(status: u16, v: serde_json::Value) -> Response<Vec<u8>> {
    resp(status, "application/json; charset=utf-8", v.to_string().into_bytes())
}
fn text(status: u16, t: &str) -> Response<Vec<u8>> {
    resp(status, "text/plain; charset=utf-8", t.as_bytes().to_vec())
}

fn mime(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref() {
        Some("html" | "htm") => "text/html; charset=utf-8",
        Some("js" | "mjs") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json") => "application/json; charset=utf-8",
        Some("md" | "txt" | "jsonl" | "csv") => "text/plain; charset=utf-8",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        Some("ico") => "image/x-icon",
        Some("pdf") => "application/pdf",
        Some("mp4") => "video/mp4",
        Some("mp3") => "audio/mpeg",
        Some("woff2") => "font/woff2",
        _ => "application/octet-stream",
    }
}

fn query(req: &Request<Vec<u8>>) -> Vec<(String, String)> {
    req.uri()
        .query()
        .map(|q| url::form_urlencoded::parse(q.as_bytes()).into_owned().collect())
        .unwrap_or_default()
}
fn qget<'a>(q: &'a [(String, String)], k: &str) -> Option<&'a str> {
    q.iter().find(|(a, _)| a == k).map(|(_, b)| b.as_str())
}

fn mtime_ms(m: &fs::Metadata) -> u64 {
    m.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn handle(st: &St, req: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let raw_path = req.uri().path().to_string();
    let path = percent_encoding::percent_decode_str(&raw_path).decode_utf8_lossy().to_string();
    let method = req.method().as_str().to_ascii_uppercase();

    if method == "OPTIONS" {
        return Response::builder()
            .status(204)
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS")
            .header("Access-Control-Allow-Headers", "*")
            .body(Vec::new())
            .unwrap();
    }

    if !st.vault.is_dir() {
        let msg = format!(
            "<!doctype html><meta charset=utf-8><title>The Office</title><body style=\"font:16px system-ui;padding:40px;background:#f6f1ea;color:#2a1f18\"><h2>Non trovo il vault</h2><p>Cercavo <code>{}</code>.</p><p>Indica il percorso giusto in <code>{}</code> (campo <code>\"vault\"</code>) e riapri l'app.</p>",
            html_esc(&st.vault.to_string_lossy()),
            html_esc(&app_data_dir().map(|d| d.join("config.json").to_string_lossy().to_string()).unwrap_or_default())
        );
        return resp(200, "text/html; charset=utf-8", msg.into_bytes());
    }

    let q = query(&req);
    match (method.as_str(), path.as_str()) {
        (_, "/" | "") => Response::builder()
            .status(302)
            .header("Location", "/_dashboard/index.html")
            .body(Vec::new())
            .unwrap(),

        ("GET", "/_api/ping") => json(
            200,
            serde_json::json!({
                "ok": true,
                "app": "the-office",
                "version": VERSION,
                "window": "custom",
                "vault": st.vault.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
                "path": st.vault.to_string_lossy(),
            }),
        ),

        ("GET", "/_api/changes") => json(200, serde_json::json!({ "n": st.changes.load(Ordering::SeqCst) })),

        ("GET", "/_api/chat-status") => {
            let s = st.chat.snapshot();
            json(200, s)
        }

        ("GET", "/_api/list") => {
            let skip: Vec<String> = qget(&q, "skip")
                .map(|s| s.split('|').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect())
                .unwrap_or_default();
            let mut out = Vec::new();
            walk(&st.vault, "", 0, &skip, &mut out);
            json(200, serde_json::Value::Array(out))
        }

        ("GET", "/_api/file") => {
            let Some(p) = qget(&q, "path").and_then(|r| safe_join(&st.vault, r)) else {
                return text(400, "percorso non valido");
            };
            match fs::read(&p) {
                Ok(b) => resp(200, mime(&p), b),
                Err(_) => text(404, "non trovato"),
            }
        }

        ("PUT" | "POST", "/_api/file") => {
            let Some(p) = qget(&q, "path").and_then(|r| safe_join(&st.vault, r)) else {
                return text(400, "percorso non valido");
            };
            match write_file(&p, req.body()) {
                Ok(()) => json(200, serde_json::json!({ "ok": true })),
                Err(e) => text(500, &format!("scrittura non riuscita: {e}")),
            }
        }

        ("DELETE", "/_api/file") => {
            // Nota cancellata dal telefono: non si elimina davvero, va nel cestino di Obsidian (.trash)
            let Some(rel) = qget(&q, "path") else { return text(400, "percorso non valido") };
            let (Some(p), Some(dst)) = (safe_join(&st.vault, rel), safe_join(&st.vault, &format!(".trash/{rel}"))) else {
                return text(400, "percorso non valido");
            };
            if !p.is_file() {
                return text(404, "non trovato");
            }
            if let Some(parent) = dst.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let dst = if dst.exists() {
                let mut d = dst.clone().into_os_string();
                d.push(format!(".{}", std::time::SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)));
                PathBuf::from(d)
            } else {
                dst
            };
            match fs::rename(&p, &dst) {
                Ok(()) => json(200, serde_json::json!({ "ok": true })),
                Err(e) => text(500, &format!("cancellazione non riuscita: {e}")),
            }
        }

        ("GET", "/_api/find") => {
            let name = qget(&q, "name").unwrap_or("").to_lowercase();
            if name.is_empty() || name.contains('/') || name.contains('\\') {
                return text(400, "nome non valido");
            }
            let mut best: Option<String> = None;
            find_file(&st.vault, "", &name, &mut best);
            match best {
                Some(p) => json(200, serde_json::json!({ "path": p })),
                None => text(404, "non trovato"),
            }
        }

        ("GET", "/_api/sync-status") => json(200, st.sync.snapshot()),

        ("GET" | "POST", "/_api/open-source") => {
            let pair = qget(&q, "pair").unwrap_or("");
            let rel = qget(&q, "rel").unwrap_or("");
            let Some(p) = st.sync.pair(pair) else { return text(404, "cartella non configurata") };
            let target = if rel.is_empty() { Some(p.source.clone()) } else { safe_join(&p.source, rel) };
            match target {
                Some(t) if t.exists() => {
                    open_external(&t.to_string_lossy());
                    json(200, serde_json::json!({ "ok": true }))
                }
                _ => text(404, "non trovato"),
            }
        }

        ("GET" | "POST", "/_api/open") => {
            let url = qget(&q, "url").unwrap_or("");
            let ok = url.starts_with("obsidian://") || url.starts_with("https://") || url.starts_with("http://");
            if !ok {
                return text(400, "link non ammesso");
            }
            open_external(url);
            json(200, serde_json::json!({ "ok": true }))
        }

        ("GET" | "HEAD", _) if !path.starts_with("/_api/") => {
            let Some(p) = safe_join(&st.vault, &path) else { return text(400, "percorso non valido") };
            let p = if p.is_dir() { p.join("index.html") } else { p };
            match fs::read(&p) {
                Ok(b) => resp(200, mime(&p), b),
                Err(_) => text(404, "non trovato"),
            }
        }

        _ => text(404, "non trovato"),
    }
}

fn walk(dir: &Path, prefix: &str, depth: usize, skip: &[String], out: &mut Vec<serde_json::Value>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name == "desktop.ini" {
            continue;
        }
        let Ok(ft) = e.file_type() else { continue };
        if ft.is_dir() {
            if depth == 0 && skip.iter().any(|s| s == &name) {
                continue;
            }
            walk(&e.path(), &format!("{prefix}{name}/"), depth + 1, skip, out);
        } else if name.to_ascii_lowercase().ends_with(".md") {
            let p = e.path();
            let Ok(meta) = fs::metadata(&p) else { continue };
            let Ok(bytes) = fs::read(&p) else { continue };
            out.push(serde_json::json!({
                "path": format!("{prefix}{name}"),
                "mtime": mtime_ms(&meta),
                "text": String::from_utf8_lossy(&bytes),
            }));
        }
    }
}

fn find_file(dir: &Path, prefix: &str, want: &str, best: &mut Option<String>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let Ok(ft) = e.file_type() else { continue };
        let rel = format!("{prefix}{name}");
        if ft.is_dir() {
            find_file(&e.path(), &format!("{rel}/"), want, best);
        } else if name.to_lowercase() == want && best.as_ref().map(|b| rel.len() < b.len()).unwrap_or(true) {
            *best = Some(rel);
        }
    }
}

fn write_file(p: &Path, body: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent)?;
    }
    // scrivi accanto e poi sostituisci: un file a metà non finisce mai nel vault
    let mut tmp = p.as_os_str().to_owned();
    tmp.push(".office-tmp");
    let tmp = PathBuf::from(tmp);
    fs::write(&tmp, body)?;
    if fs::rename(&tmp, p).is_err() {
        // Google Drive a volte tiene il file aperto: ripiega sulla scrittura diretta
        let r = fs::write(p, body);
        let _ = fs::remove_file(&tmp);
        r?;
    }
    Ok(())
}

pub fn open_external(url: &str) {
    // Windows: ShellExecuteW apre l'indirizzo nel programma predefinito (browser, Obsidian…).
    // Prima usavamo explorer.exe, che con URL contenenti ? e + apriva Esplora risorse.
    #[cfg(windows)]
    {
        win_open::open(url);
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(url).spawn();
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let _ = std::process::Command::new("xdg-open").arg(url).spawn();
    }
}

#[cfg(windows)]
mod win_open {
    use std::ffi::c_void;
    use std::ptr::{null, null_mut};
    #[link(name = "shell32")]
    extern "system" {
        fn ShellExecuteW(hwnd: *mut c_void, op: *const u16, file: *const u16, params: *const u16, dir: *const u16, show: i32) -> isize;
    }
    #[link(name = "ole32")]
    extern "system" {
        fn CoInitializeEx(reserved: *const c_void, coinit: u32) -> i32;
    }
    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }
    pub fn open(url: &str) {
        let (op, file) = (wide("open"), wide(url));
        unsafe {
            // COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE, come raccomanda la documentazione di ShellExecute
            CoInitializeEx(null(), 0x2 | 0x4);
            let r = ShellExecuteW(null_mut(), op.as_ptr(), file.as_ptr(), null(), null(), 1 /* SW_SHOWNORMAL */);
            if r <= 32 {
                crate::chat::log(&format!("apertura link non riuscita ({r}): {url}"));
            }
        }
    }
}

fn html_esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}
