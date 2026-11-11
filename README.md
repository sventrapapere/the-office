# The Office 2.0 — sorgenti

Interfaccia unica per PC e telefono (React 19 + Vite + Tailwind 4, stile Grafite).

- **PC**: la build (`npm run build` → `dist/`) va in `GONDISHAPUR/_dashboard/` (`index.html` + `assets/`).
  La serve `TheOffice.exe` (sorgenti Rust in `_dashboard/app/`), che legge e scrive la cartella del vault.
  La v1 resta in `_dashboard/index-v1.html`.
- **Telefono (Android)**: guscio Tauri in `android/`, APK compilato da GitHub Actions (`.github/workflows/android.yml`).
  Le note arrivano da Supabase.
- **Supabase** (piano gratuito): `supabase/schema.sql` da eseguire una volta nel SQL Editor.
  Il PC, se collegato (Impostazioni → Collegamento online), sincronizza cartella ↔ Supabase a tre vie
  (`src/vault/sync.ts`): conflitti salvati come “… (conflitto PC …).md”, il Registro abitudini si unisce.

## Struttura
- `src/lib` — parser della checklist e del registro (identici alla v1, testati), markdown, allegati
- `src/vault` — sorgenti dati: `desktop` (API `/_api/*` dell'exe), `supabase` (cache + coda offline), `memory` (prove), `sync`, `connect` (avvio)
- `src/views` — Home, Note, Film, Libri, Ricette, Miniature, Giappone, Impostazioni, lettore/editor
- `src/ui` — menu flottante (PC), schede in basso (telefono), ricerca Ctrl K, cattura, chat Claude, componenti

## Comandi
- `npm run dev` — sviluppo con i dati di prova (`dev/vault.json`, creato da `scripts/mkfixture.mjs`, non versionato)
- `npm test` — test di parser e sincronizzazione
- `npm run build` — build in `dist/`
