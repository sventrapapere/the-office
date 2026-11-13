// Chat con Claude dalla dashboard: fa quello che faceva chat-watcher.ps1.
// La pagina scrive i messaggi in _dashboard/chat-in.jsonl; qui li passiamo a Claude Code
// (lanciato nella cartella del vault, con il tuo account) e scriviamo stato e risposte
// in _dashboard/chat-out.jsonl. Stesso formato di prima, quindi la pagina non cambia.

use std::{
    collections::{HashMap, HashSet},
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde_json::{json, Value};

const SYS: &str = "Stai rispondendo dal pannello chat della dashboard The Office. Segui la sezione Chat dalla dashboard di CLAUDE.md: esegui le richieste chiare, chiedi se sono ambigue, rispondi breve in italiano e chiudi dicendo quali file hai cambiato.";
const ALLOW: &str = "Read,Glob,Grep,Edit,Write,WebSearch,WebFetch,TodoWrite";
const DENY: &str = "Bash,Edit(./_dashboard/**),Write(./_dashboard/**),Edit(./.claude/**),Write(./.claude/**),Edit(./CLAUDE.md),Write(./CLAUDE.md),Edit(./.obsidian/**),Write(./.obsidian/**)";
const MAX_AGE_HOURS: f64 = 12.0;

#[derive(Default)]
pub struct ChatState {
    inner: Mutex<Value>,
}
impl ChatState {
    fn set(&self, k: &str, v: Value) {
        let mut g = self.inner.lock().unwrap();
        if !g.is_object() {
            *g = json!({});
        }
        g[k] = v;
    }
    pub fn snapshot(&self) -> Value {
        let g = self.inner.lock().unwrap();
        if g.is_object() {
            g.clone()
        } else {
            json!({ "worker": "starting" })
        }
    }
}

pub fn start(vault: PathBuf, state: std::sync::Arc<ChatState>) {
    std::thread::spawn(move || {
        // se è acceso il vecchio chat-watcher.ps1 lascia lavorare lui
        if !single_instance("Local\\TheOfficeChatWatcher") {
            state.set("worker", json!("ps1"));
            log("chat: c'è già chat-watcher.ps1 acceso, la chat la gestisce lui");
            return;
        }
        let Some(claude) = find_claude() else {
            state.set("worker", json!("no-claude"));
            log("chat: comando claude non trovato");
            return;
        };
        state.set("worker", json!("on"));
        state.set("claude", json!(claude.to_string_lossy()));
        log(&format!("chat attiva, claude = {}", claude.display()));

        let dash = vault.join("_dashboard");
        let in_file = dash.join("chat-in.jsonl");
        let out_file = dash.join("chat-out.jsonl");
        let _ = save_posters(&vault);

        let mut last: Option<SystemTime> = None;
        loop {
            let mt = fs::metadata(&in_file).and_then(|m| m.modified()).ok();
            if mt != last {
                last = mt;
                state.set("busy", json!(true));
                process_pending(&vault, &claude, &in_file, &out_file);
                state.set("busy", json!(false));
            }
            std::thread::sleep(Duration::from_millis(1000));
        }
    });
}

fn process_pending(vault: &Path, claude: &Path, in_file: &Path, out_file: &Path) {
    loop {
        let ins = read_jsonl(in_file);
        let outs = read_jsonl(out_file);
        let mut done = HashSet::new();
        let mut sessions: HashMap<String, String> = HashMap::new();
        for o in &outs {
            let t = o["type"].as_str().unwrap_or("");
            if t == "reply" || t == "error" {
                done.insert(sv(&o["re"]));
            }
            if t == "reply" {
                if let (Some(s), Some(c)) = (o["session"].as_str(), o["conv"].as_str()) {
                    if !s.is_empty() {
                        sessions.insert(c.to_string(), s.to_string());
                    }
                }
            }
        }
        let Some(next) = ins.iter().find(|m| m["type"] == "msg" && !done.contains(&sv(&m["id"]))) else {
            return;
        };
        let id = sv(&next["id"]);
        let conv = sv(&next["conv"]);
        let msg_text = sv(&next["text"]);

        let age_h = parse_iso_ms(&sv(&next["ts"]))
            .map(|t| (now_ms() as f64 - t as f64) / 3_600_000.0)
            .unwrap_or(0.0);
        if age_h > MAX_AGE_HOURS {
            add_out(out_file, json!({ "type": "error", "re": id, "conv": conv, "ts": now_iso(),
                "text": "Messaggio scaduto: l'app non era aperta quando l'hai scritto. Riscrivilo se serve ancora." }));
            continue;
        }

        log(&format!("Marco: {msg_text}"));
        add_out(out_file, json!({ "type": "status", "re": id, "conv": conv, "ts": now_iso(), "state": "working" }));

        let session = sessions.get(&conv).cloned();
        let mut r = invoke(claude, vault, &msg_text, session.as_deref());
        let failed = |r: &Invoke| r.json.as_ref().map(|j| j["is_error"].as_bool().unwrap_or(false)).unwrap_or(true);
        if failed(&r) && session.is_some() {
            log("riprendo senza la sessione precedente");
            r = invoke(claude, vault, &msg_text, None);
        }

        let result = r.json.as_ref().and_then(|j| j["result"].as_str()).unwrap_or("").to_string();
        if !failed(&r) && !result.is_empty() {
            let mut reply = result;
            let posters = save_posters(vault);
            if !posters.is_empty() {
                reply.push_str(&format!(
                    "\n\nLocandina salvata in `60 Film, serie e anime/_posters/{}`.",
                    posters.join("`, `")
                ));
            }
            let sess = r.json.as_ref().map(|j| sv(&j["session_id"])).unwrap_or_default();
            log(&format!("Claude: {reply}"));
            add_out(out_file, json!({ "type": "reply", "re": id, "conv": conv, "ts": now_iso(), "text": reply, "session": sess }));
        } else {
            let msg = if !result.is_empty() {
                result
            } else if !r.raw.trim().is_empty() {
                r.raw.chars().take(600).collect()
            } else {
                format!("Claude Code è uscito con codice {} senza risposta.", r.code)
            };
            log(&format!("errore: {msg}"));
            add_out(out_file, json!({ "type": "error", "re": id, "conv": conv, "ts": now_iso(), "text": msg }));
        }
    }
}

struct Invoke {
    json: Option<Value>,
    raw: String,
    code: i32,
}

fn invoke(claude: &Path, vault: &Path, text: &str, session: Option<&str>) -> Invoke {
    let mut cmd = Command::new(claude);
    cmd.args(["-p", "--output-format", "json", "--max-turns", "40"])
        .args(["--allowedTools", ALLOW, "--disallowedTools", DENY, "--append-system-prompt", SYS]);
    if let Some(s) = session {
        cmd.args(["--resume", s]);
    }
    cmd.current_dir(vault).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    no_window(&mut cmd);
    let child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => return Invoke { json: None, raw: format!("Non riesco ad avviare Claude Code: {e}"), code: -1 },
    };
    let mut child = child;
    if let Some(mut si) = child.stdin.take() {
        let _ = si.write_all(text.as_bytes());
    }
    let out = match child.wait_with_output() {
        Ok(o) => o,
        Err(e) => return Invoke { json: None, raw: format!("Claude Code non ha risposto: {e}"), code: -1 },
    };
    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).to_string();
    let mut j = None;
    for l in stdout.lines() {
        let t = l.trim();
        if t.starts_with('{') {
            if let Ok(v) = serde_json::from_str::<Value>(t) {
                j = Some(v);
            }
        }
    }
    if j.is_none() {
        j = serde_json::from_str::<Value>(stdout.trim()).ok();
    }
    let raw = if stdout.trim().is_empty() { stderr } else { stdout };
    Invoke { json: j, raw, code: out.status.code().unwrap_or(-1) }
}

/* ───────────── locandine ─────────────
   Se una nota della watchlist ha "poster:" con un URL, scarica l'immagine in _posters/
   e sostituisce l'URL con il percorso locale (Claude dalla chat non ha la shell). */
fn save_posters(vault: &Path) -> Vec<String> {
    let mut saved = Vec::new();
    let watch = vault.join("60 Film, serie e anime");
    let titoli = watch.join("Titoli");
    let Ok(rd) = fs::read_dir(&titoli) else { return saved };
    for e in rd.flatten() {
        let p = e.path();
        if p.extension().and_then(|x| x.to_str()).map(|x| x.eq_ignore_ascii_case("md")) != Some(true) {
            continue;
        }
        let Ok(text) = fs::read_to_string(&p) else { continue };
        // trova la riga "poster: https://..."
        let mut offset = 0usize;
        let mut hit: Option<(usize, usize, String)> = None;
        for line in text.split_inclusive('\n') {
            let body = line.trim_end_matches(['\n', '\r']);
            if let Some(rest) = body.strip_prefix("poster:") {
                let v = rest.trim().trim_matches('"').trim();
                if (v.starts_with("http://") || v.starts_with("https://")) && !v.contains(char::is_whitespace) {
                    hit = Some((offset, offset + body.len(), v.to_string()));
                    break;
                }
            }
            offset += line.len();
        }
        let Some((start, end, url)) = hit else { continue };

        let path_part = url.split(['?', '#']).next().unwrap_or("");
        let mut ext = Path::new(path_part)
            .extension()
            .and_then(|x| x.to_str())
            .map(|x| format!(".{}", x.to_ascii_lowercase()))
            .unwrap_or_default();
        if ![".jpg", ".jpeg", ".png", ".webp"].contains(&ext.as_str()) {
            ext = ".jpg".into();
        }
        let posters = watch.join("_posters");
        let _ = fs::create_dir_all(&posters);
        let stem = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        let name = format!("{stem}{ext}");
        let dest = posters.join(&name);
        let tmp = std::env::temp_dir().join(format!("theoffice-poster-{}.part", now_ms()));

        let mut cmd = Command::new(if cfg!(windows) { "curl.exe" } else { "curl" });
        cmd.args(["-sSL", "--max-time", "30", "-A", "TheOffice/1.0 (dashboard personale)", "-o"])
            .arg(&tmp)
            .arg(&url)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        no_window(&mut cmd);
        let ok = cmd.status().map(|s| s.success()).unwrap_or(false);
        let good = ok
            && fs::read(&tmp)
                .map(|b| {
                    b.len() >= 2048
                        && ((b[0] == 0xFF && b[1] == 0xD8) || (b[0] == 0x89 && b[1] == 0x50) || (b[0] == 0x52 && b[1] == 0x49))
                })
                .unwrap_or(false);
        if good && (fs::rename(&tmp, &dest).is_ok() || fs::copy(&tmp, &dest).is_ok()) {
            let new_text = format!("{}poster: \"_posters/{}\"{}", &text[..start], name, &text[end..]);
            if fs::write(&p, new_text).is_ok() {
                log(&format!("locandina salvata: _posters/{name}"));
                saved.push(name);
            }
        } else {
            log(&format!("locandina non scaricata per {stem}"));
        }
        let _ = fs::remove_file(&tmp);
    }
    saved
}

/* ───────────── utilità ───────────── */

fn sv(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

fn read_jsonl(path: &Path) -> Vec<Value> {
    let mut raw = None;
    for _ in 0..5 {
        match fs::read(path) {
            Ok(b) => {
                raw = Some(String::from_utf8_lossy(&b).to_string());
                break;
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Vec::new(),
            Err(_) => std::thread::sleep(Duration::from_millis(300)),
        }
    }
    raw.unwrap_or_default()
        .lines()
        .map(|l| l.trim().trim_start_matches('\u{feff}'))
        .filter(|l| !l.is_empty())
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect()
}

fn add_out(path: &Path, v: Value) {
    let line = format!("{}\n", v);
    for _ in 0..8 {
        let r = fs::OpenOptions::new().create(true).append(true).open(path).and_then(|mut f| f.write_all(line.as_bytes()));
        if r.is_ok() {
            return;
        }
        std::thread::sleep(Duration::from_millis(400));
    }
    log(&format!("non riesco a scrivere in {}", path.display()));
}

fn find_claude() -> Option<PathBuf> {
    let names: &[&str] = if cfg!(windows) { &["claude.exe", "claude.cmd"] } else { &["claude"] };
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")).map(PathBuf::from);
    if let Some(h) = &home {
        for n in names {
            let p = h.join(".local").join("bin").join(n);
            if p.is_file() {
                return Some(p);
            }
        }
    }
    if let Some(path) = std::env::var_os("PATH") {
        for n in names {
            for d in std::env::split_paths(&path) {
                let p = d.join(n);
                if p.is_file() {
                    return Some(p);
                }
            }
        }
    }
    None
}

fn no_window(_cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        _cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
}

#[cfg(windows)]
fn single_instance(name: &str) -> bool {
    use std::ffi::c_void;
    #[link(name = "kernel32")]
    extern "system" {
        fn CreateMutexW(attr: *const c_void, initial_owner: i32, name: *const u16) -> *mut c_void;
        fn GetLastError() -> u32;
    }
    let w: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        let h = CreateMutexW(std::ptr::null(), 1, w.as_ptr());
        if h.is_null() {
            return true;
        }
        GetLastError() != 183 // ERROR_ALREADY_EXISTS
    }
}
#[cfg(not(windows))]
fn single_instance(_name: &str) -> bool {
    true
}

pub fn log(msg: &str) {
    let Some(dir) = crate::app_data_dir() else { return };
    let _ = fs::create_dir_all(&dir);
    let p = dir.join("the-office.log");
    if fs::metadata(&p).map(|m| m.len() > 1_000_000).unwrap_or(false) {
        let _ = fs::rename(&p, dir.join("the-office.old.log"));
    }
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(&p) {
        let _ = writeln!(f, "[{}] {}", now_iso(), msg);
    }
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// "2026-11-01T20:15:03.120Z" (UTC, come toISOString in JavaScript)
pub fn now_iso() -> String {
    let ms = now_ms();
    let secs = ms.div_euclid(1000);
    let (y, mo, d) = civil_from_days(secs.div_euclid(86_400));
    let s = secs.rem_euclid(86_400);
    format!("{y:04}-{mo:02}-{d:02}T{:02}:{:02}:{:02}.{:03}Z", s / 3600, s % 3600 / 60, s % 60, ms.rem_euclid(1000))
}

/// Legge "2026-10-31T21:57:06.493Z" o "...+01:00" in millisecondi dal 1970.
fn parse_iso_ms(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    if b.len() < 19 {
        return None;
    }
    let n = |a: usize, z: usize| s.get(a..z)?.parse::<i64>().ok();
    let (y, mo, d, h, mi, se) = (n(0, 4)?, n(5, 7)?, n(8, 10)?, n(11, 13)?, n(14, 16)?, n(17, 19)?);
    let mut i = 19;
    let mut frac_ms = 0i64;
    if b.get(i) == Some(&b'.') {
        i += 1;
        let st = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        let f = &s[st..i];
        let f3: String = f.chars().chain("000".chars()).take(3).collect();
        frac_ms = f3.parse().unwrap_or(0);
    }
    let mut off_min = 0i64;
    if let Some(&c) = b.get(i) {
        if c == b'+' || c == b'-' {
            let oh = n(i + 1, i + 3)?;
            let om = n(i + 4, i + 6).unwrap_or(0);
            off_min = (oh * 60 + om) * if c == b'-' { -1 } else { 1 };
        }
    }
    let days = days_from_civil(y, mo, d);
    Some(((days * 86_400 + h * 3600 + mi * 60 + se - off_min * 60) * 1000) + frac_ms)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn iso_roundtrip() {
        let t = parse_iso_ms("2026-10-31T21:57:06.493Z").unwrap();
        assert_eq!(t, 1_793_483_826_493);
        assert_eq!(parse_iso_ms("2026-10-31T22:57:06.493+01:00").unwrap(), t);
        let now = now_iso();
        let back = parse_iso_ms(&now).unwrap();
        assert!((back - now_ms()).abs() < 2000);
    }
}
