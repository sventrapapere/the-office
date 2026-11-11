// The Office per Android: guscio Tauri attorno all'interfaccia (cartella dist).
// Le note arrivano da Supabase direttamente dalla pagina: qui non serve altro.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("errore all'avvio di The Office");
}
