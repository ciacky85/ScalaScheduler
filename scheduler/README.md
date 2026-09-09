# ScalaScheduler — WebApp & Core (v2.2.1)

Applicazione Web principale sviluppata in **Next.js 15 (App Router)** e **TypeScript**.

- **Frontend**:
  - **Importa Calendario**: parsing client-side PDF quindicinali, tabella eventi interattiva ed esportazione Google Calendar riservata per artista.
  - **ODG (Ordine del Giorno)**:
    - *Programma ODG & Push*: tabella read-only in tempo reale, dry run e sync manuale.
    - *Registro Modifiche & Screenshot*: visualizzatore cronologico scatti, rilevamento modifiche visuali (`_edit.png`), baseline 00:02, anteprime affiancate, dialog a schermo intero con zoom e link Google Drive.
  - **Impostazioni & Utenti (Admin)**: configurazione hub calendari Google (`ownerUserId`), Google Drive (OAuth 2.0 user quota) e gestione utenti con approvazione RBAC.
  - **Scraper Manager (Admin)**: trigger manuale scraping ed esecuzione on-demand.
- **Backend / API**:
  - `POST /api/odg/auto-sync`: sincronizzazione automatica post-scraping con motore unificato [`src/lib/calendar/odg-sync.ts`](./src/lib/calendar/odg-sync.ts).
  - `GET /api/odg/modifications`: storico strutturato modifiche visuali e scatti del giorno.
  - `GET /api/screenshots/image`: streaming sicuro di screenshot PNG locali.
  - `POST /api/screenshots/sync` & `upload`: sincronizzazione a due fasi (Folder-First Diff) verso Google Drive con upload nativo in stream.
- **Runtime**: Compilato in modalità `standalone` e integrato nel container unificato di produzione con `Dockerfile` alla radice del progetto.

Per la documentazione completa di installazione e deploy, consultare il [`README.md`](../README.md) principale.

