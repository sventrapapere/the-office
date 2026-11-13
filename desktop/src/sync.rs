// Sincronizzazione bidirezionale fra una cartella esterna (es. Documents\Kit MESBG) e una
// cartella del vault (es. "55 Miniature/Kit MESBG"). La configurazione sta nel vault, in
// `_dashboard/sync.json`:
//
//   { "pairs": [ { "name": "Kit MESBG",
//                  "source": "C:\\Users\\marc9\\Documents\\Kit MESBG",
//                  "target": "55 Miniature/Kit MESBG",
//                  "include": ["*.md", "Manuale ITA/Traduzione/*.md"] } ] }
//
// Regole, per ogni file che corrisponde a "include":
// - se cambia da una parte sola (rispetto all'ultima sincronizzazione) si copia dall'altra;
// - se cambia da entrambe le parti vince il più recente, l'altro va in backup;
// - se sparisce dalla sorgente, la copia nel vault va in backup e viene tolta;
// - se sparisce dal vault, viene ricreata dalla sorgente (la fonte di verità è la sorgente).
// I backup stanno in %APPDATA%\TheOffice\sync-backup\<data-ora>\...

use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    sync::{mpsc, Arc, Mutex},
    time::{Duration, SystemTime},
};

use serde_json::{json, Value};

#[derive(Clone)]
pub struct Pair {
    pub name: String,
    pub source: PathBuf,
    pub target: PathBuf,
    target_rel: String,
    include: Vec<String>,
}

#[derive(Default)]
pub struct SyncState {
    status: Mutex<Value>,
    pairs: Mutex<Vec<Pair>>,
}
impl SyncState {
    pub fn snapshot(&self) -> Value {
        let s = self.status.lock().unwrap().clone();
        if s.is_null() {
            json!({ "pairs": [] })
        } else {
            s
        }
    }
    pub fn pair(&self, name: &str) -> Option<Pair> {
        self.pairs.lock().unwrap().iter().find(|p| p.name == name).cloned()
    }
}

fn load_pairs(vault: &Path) -> Vec<Pair> {
    let Ok(t) = fs::read_to_string(vault.join("_dashboard").join("sync.json")) else { return Vec::new() };
    let Ok(j) = serde_json::from_str::<Value>(t.trim_start_matches('\u{feff}')) else {
        crate::chat::log("sync.json non è JSON valido");
        return Vec::new();
    };
    j["pairs"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|p| {
                    let source = PathBuf::from(p["source"].as_str()?);
                    let target_rel = p["target"].as_str()?.trim_matches('/').to_string();
                    let target = crate::safe_join_pub(vault, &target_rel)?;
                    let include = p["include"]
                        .as_array()
                        .map(|x| x.iter().filter_map(|s| s.as_str().map(String::from)).collect())
                        .unwrap_or_else(|| vec!["*.md".to_string()]);
                    Some(Pair { name: p["name"].as_str().unwrap_or(&target_rel).to_string(), source, target, target_rel, include })
                })
                .collect()
        })
        .unwrap_or_default()
}

pub fn start(vault: PathBuf, state: Arc<SyncState>) {
    let pairs = load_pairs(&vault);
    *state.pairs.lock().unwrap() = pairs.clone();
    if pairs.is_empty() {
        return;
    }
    let (tx, rx) = mpsc::channel::<()>();
    // osserva sia la sorgente sia la cartella nel vault
    for p in &pairs {
        for dir in [&p.source, &p.target] {
            let _ = fs::create_dir_all(dir);
            let tx = tx.clone();
            match notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
                if let Ok(ev) = res {
                    if !matches!(ev.kind, notify::EventKind::Access(_))
                        && ev.paths.iter().any(|p| !p.to_string_lossy().ends_with(".office-tmp"))
                    {
                        let _ = tx.send(());
                    }
                }
            }) {
                Ok(mut w) => {
                    use notify::Watcher;
                    if w.watch(dir, notify::RecursiveMode::Recursive).is_ok() {
                        std::mem::forget(w);
                    }
                }
                Err(e) => crate::chat::log(&format!("sync: watcher non avviato su {}: {e}", dir.display())),
            }
        }
    }
    std::thread::spawn(move || loop {
        let mut out = Vec::new();
        for p in &pairs {
            out.push(sync_pair(p));
        }
        *state.status.lock().unwrap() = json!({ "pairs": out });
        // aspetta una modifica (o un minuto), poi lascia finire la raffica di eventi
        let _ = rx.recv_timeout(Duration::from_secs(60));
        std::thread::sleep(Duration::from_millis(500));
        while rx.try_recv().is_ok() {}
    });
}

fn glob_seg(pat: &str, s: &str) -> bool {
    // "*" e "*.md" / "prefisso*" / letterale (senza distinzione maiuscole per l'estensione)
    if pat == "*" {
        return true;
    }
    if let Some(star) = pat.find('*') {
        let (a, b) = (&pat[..star], &pat[star + 1..]);
        let sl = s.to_lowercase();
        s.len() >= a.len() + b.len() && s.starts_with(a) && sl.ends_with(&b.to_lowercase())
    } else {
        pat == s
    }
}
fn matches(include: &[String], rel: &str) -> bool {
    let segs: Vec<&str> = rel.split('/').collect();
    include.iter().any(|p| {
        let ps: Vec<&str> = p.split('/').collect();
        ps.len() == segs.len() && ps.iter().zip(&segs).all(|(a, b)| glob_seg(a, b))
    })
}

fn list(root: &Path, include: &[String], out: &mut BTreeSet<String>) {
    let depth = include.iter().map(|p| p.split('/').count()).max().unwrap_or(1);
    fn walk(dir: &Path, prefix: &str, left: usize, include: &[String], out: &mut BTreeSet<String>) {
        let Ok(rd) = fs::read_dir(dir) else { return };
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || name == "desktop.ini" || name.ends_with(".office-tmp") {
                continue;
            }
            let rel = format!("{prefix}{name}");
            let Ok(ft) = e.file_type() else { continue };
            if ft.is_dir() {
                if left > 1 {
                    walk(&e.path(), &format!("{rel}/"), left - 1, include, out);
                }
            } else if matches(include, &rel) {
                out.insert(rel);
            }
        }
    }
    walk(root, "", depth, include, out);
}

fn hash(b: &[u8]) -> String {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    b.hash(&mut h);
    format!("{:016x}", h.finish())
}

fn state_path() -> Option<PathBuf> {
    crate::app_data_dir().map(|d| d.join("sync-state.json"))
}
fn load_state(pair: &str) -> BTreeMap<String, String> {
    state_path()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .and_then(|j| serde_json::from_value(j[pair].clone()).ok())
        .unwrap_or_default()
}
fn save_state(pair: &str, st: &BTreeMap<String, String>) {
    let Some(p) = state_path() else { return };
    let mut all = fs::read_to_string(&p).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()).unwrap_or(json!({}));
    all[pair] = serde_json::to_value(st).unwrap_or(json!({}));
    if let Some(d) = p.parent() {
        let _ = fs::create_dir_all(d);
    }
    let _ = fs::write(&p, all.to_string());
}

fn rel_path(root: &Path, rel: &str) -> PathBuf {
    let mut p = root.to_path_buf();
    for s in rel.split('/') {
        p.push(s);
    }
    p
}

fn write(p: &Path, b: &[u8]) -> std::io::Result<()> {
    if let Some(d) = p.parent() {
        fs::create_dir_all(d)?;
    }
    let mut tmp = p.as_os_str().to_owned();
    tmp.push(".office-tmp");
    let tmp = PathBuf::from(tmp);
    fs::write(&tmp, b)?;
    if fs::rename(&tmp, p).is_err() {
        let r = fs::write(p, b);
        let _ = fs::remove_file(&tmp);
        r?;
    }
    Ok(())
}

fn backup(pair: &str, side: &str, rel: &str, b: &[u8]) {
    let Some(d) = crate::app_data_dir() else { return };
    let stamp = crate::chat::now_iso().replace([':', '.'], "-");
    let p = rel_path(&d.join("sync-backup").join(&stamp).join(pair).join(side), rel);
    let _ = write(&p, b);
}

fn mtime(p: &Path) -> SystemTime {
    fs::metadata(p).and_then(|m| m.modified()).unwrap_or(SystemTime::UNIX_EPOCH)
}

fn sync_pair(p: &Pair) -> Value {
    let mut errors: Vec<String> = Vec::new();
    let mut copied = 0usize;
    if !p.source.is_dir() {
        return json!({ "name": p.name, "source": p.source.to_string_lossy(), "target": p.target_rel, "ok": false,
                       "error": "cartella sorgente non trovata", "last": crate::chat::now_iso() });
    }
    let mut st = load_state(&p.name);
    let mut files = BTreeSet::new();
    list(&p.source, &p.include, &mut files);
    list(&p.target, &p.include, &mut files);
    files.extend(st.keys().cloned());

    for rel in &files {
        let (sp, tp) = (rel_path(&p.source, rel), rel_path(&p.target, rel));
        let (sb, tb) = (fs::read(&sp).ok(), fs::read(&tp).ok());
        let known = st.get(rel).cloned();
        let mut res: std::io::Result<()> = Ok(());
        match (sb, tb) {
            (Some(s), Some(t)) => {
                let (hs, ht) = (hash(&s), hash(&t));
                if hs != ht {
                    let src_wins = match known.as_deref() {
                        Some(k) if k == ht => true,  // cambiata solo la sorgente
                        Some(k) if k == hs => false, // cambiata solo la copia nel vault
                        _ => mtime(&sp) >= mtime(&tp), // cambiate entrambe (o primo incontro): vince la più recente
                    };
                    let both = !matches!(known.as_deref(), Some(k) if k == hs || k == ht);
                    if src_wins {
                        if both {
                            backup(&p.name, "vault", rel, &t);
                        }
                        res = write(&tp, &s);
                    } else {
                        if both {
                            backup(&p.name, "sorgente", rel, &s);
                        }
                        res = write(&sp, &t);
                    }
                    if res.is_ok() {
                        copied += 1;
                        crate::chat::log(&format!("sync {}: {} {}", p.name, if src_wins { "→ vault" } else { "→ sorgente" }, rel));
                    }
                }
                if res.is_ok() {
                    // dopo la copia i due lati sono uguali: registro l'hash del contenuto attuale
                    let now = fs::read(&tp).map(|b| hash(&b)).unwrap_or(hs);
                    st.insert(rel.clone(), now);
                }
            }
            (Some(s), None) => {
                // nuova nella sorgente, oppure cancellata dal vault: la sorgente comanda
                res = write(&tp, &s);
                if res.is_ok() {
                    copied += 1;
                    st.insert(rel.clone(), hash(&s));
                }
            }
            (None, Some(t)) => {
                if known.is_some() {
                    // tolta dalla sorgente: la copia nel vault va in backup e sparisce
                    backup(&p.name, "vault", rel, &t);
                    res = fs::remove_file(&tp);
                    if res.is_ok() {
                        st.remove(rel);
                        crate::chat::log(&format!("sync {}: tolta dal vault {}", p.name, rel));
                    }
                } else {
                    // nuova nel vault (corrisponde a "include"): va nella sorgente
                    res = write(&sp, &t);
                    if res.is_ok() {
                        copied += 1;
                        st.insert(rel.clone(), hash(&t));
                    }
                }
            }
            (None, None) => {
                st.remove(rel);
            }
        }
        if let Err(e) = res {
            errors.push(format!("{rel}: {e}"));
        }
    }
    save_state(&p.name, &st);
    if !errors.is_empty() {
        crate::chat::log(&format!("sync {}: {} errori, primo: {}", p.name, errors.len(), errors[0]));
    }
    json!({ "name": p.name, "source": p.source.to_string_lossy(), "target": p.target_rel, "ok": errors.is_empty(),
            "files": st.len(), "copied": copied, "errors": errors, "last": crate::chat::now_iso() })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn globbing() {
        let inc = vec!["*.md".to_string(), "Manuale ITA/Traduzione/*.md".to_string()];
        assert!(matches(&inc, "inventario.md"));
        assert!(matches(&inc, "LEGGIMI.MD"));
        assert!(matches(&inc, "Manuale ITA/Traduzione/01-Intro.md"));
        assert!(!matches(&inc, "Design System/x.md"));
        assert!(!matches(&inc, "foto.png"));
    }
}
