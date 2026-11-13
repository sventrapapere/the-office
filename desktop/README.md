---
title: "The Office — app desktop"
created: 2026-11-01
lang: it
status: processed
tags: [dashboard, meta]
---

# The Office — app desktop

`TheOffice.exe` è un guscio leggero (Tauri + WebView2 di Windows, ~6 MB) attorno alla dashboard `_dashboard/index.html`.

## Installare / aggiornare
- Doppio clic su `Installa The Office.cmd` (da Esplora file: Obsidian non mostra .cmd).
- La prima volta installa Visual Studio Build Tools e Rust (servono solo a compilare, ~2–3 GB, chiede l'autorizzazione di amministratore) e compila: 5–10 minuti.
- Poi: menu Start → "The Office" → tasto destro → *Aggiungi a Start* / *Aggiungi alla barra delle applicazioni*.
- Va rilanciato solo se cambia il codice Rust in questa cartella (`src/`). Le modifiche a `index.html` si vedono riaprendo l'app o premendo **F5**.

## Come funziona
- **Dalla 2.1** la finestra non ha la cornice di Windows: la barra del titolo (nome, ricerca, sincronizzazione, Claude, riduci/ingrandisci/chiudi) la disegna la pagina e comanda la finestra con `POST /_api/window?do=minimize|maximize|close|drag`. Si trascina dalle zone libere, doppio clic ingrandisce, i bordi ridimensionano.
- I sorgenti di questa cartella sono anche nel repository `sventrapapere/the-office` (cartella `desktop/`): a ogni modifica GitHub li compila su Windows per verificarli (release `desktop-latest`).
- L'app non contiene la dashboard: la legge dal vault a ogni avvio da `http://office.localhost/_dashboard/index.html` (indirizzo interno, nessuna porta aperta).
- La pagina legge e scrive il vault tramite `/_api/...` (vedi commento in cima a `src/main.rs`): niente più richieste di permesso.
- Quando cambi una nota (anche da Obsidian) la dashboard si aggiorna da sola.
- La chat con Claude la gestisce l'app (`src/chat.rs`, stessa logica di `chat-watcher.ps1`, locandine comprese): niente finestra PowerShell.
- I link alle note si aprono **dentro l'app** in un pannello laterale: lettura con wikilink, immagini, callout e checkbox cliccabili; **Modifica** (Ctrl+E) e **Salva** (Ctrl+S); Esc per chiudere; Ctrl+clic su un link = apri in Obsidian. Gli altri link web si aprono nel browser.

## Versioni
- 1.0 — app desktop, accesso al vault, aggiornamento automatico, chat integrata.
- 1.1 — ricerca degli allegati per nome in tutto il vault (immagini `![[...]]` nel lettore di note). Serve rilanciare `Installa The Office.cmd`.
- 1.2 — i link web (es. trailer) si aprono nel browser predefinito con ShellExecute; prima explorer.exe apriva Esplora risorse con gli URL che contengono `?` o `+`. Serve rilanciare `Installa The Office.cmd`.
- 2.0 — nuova interfaccia (Grafite, React) in `_dashboard/index.html` + `_dashboard/assets/`; la v1 resta in `_dashboard/index-v1.html`. Nuova API `DELETE /_api/file` (sposta nel cestino `.trash` di Obsidian) usata dalla sincronizzazione con il telefono. La nuova interfaccia funziona anche con l'app 1.3: rilanciare `Installa The Office.cmd` serve solo per propagare al PC le note cancellate dal telefono.
- 1.3 — cartelle sincronizzate (`src/sync.rs`, configurazione in `_dashboard/sync.json`): `Documents\Kit MESBG` ↔ `55 Miniature/Kit MESBG`, in entrambe le direzioni; `/_api/sync-status` e `/_api/open-source` per aprire PDF e cartelle del kit. Serve rilanciare `Installa The Office.cmd`.

## Dove stanno le cose
- Programma: `%LOCALAPPDATA%\Programs\TheOffice\TheOffice.exe`
- Impostazioni: `%APPDATA%\TheOffice\config.json` (`"vault"`: percorso del vault) e log `the-office.log`
- File di compilazione: `%LOCALAPPDATA%\TheOffice\build` (fuori da Google Drive; si può cancellare)
- Sincronizzazione: stato in `%APPDATA%\TheOffice\sync-state.json`, copie di sicurezza dei conflitti in `%APPDATA%\TheOffice\sync-backup\`
