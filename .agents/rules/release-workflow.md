# ScalaScheduler Workflow Rules

Ogni volta che si applicano modifiche al codice del progetto, eseguire sempre i seguenti passaggi prima di concludere il task:

1. **Avanzare il numero di versione**:
   - `version.json`: aggiornare `version`, `label`, `buildDate` e `changelog`.
   - `scheduler/src/version.ts`: aggiornare `APP_VERSION`, `APP_BUILD_DATE` e `APP_CHANGELOG`.
   - `scheduler/package.json`: aggiornare il campo `version`.

2. **Aggiornare la documentazione Markdown**:
   - `README.md`: aggiornare numero versione nei titoli/badge e descrivere le novità.
   - `scheduler/README.md`: aggiornare il titolo con la versione.
   - `ANALISI_TECNICA.md`: aggiornare la versione attuale e le sezioni tecniche pertinenti.

3. **Commit e Push su Git**:
   - Verificare che il build passi (`npm run build` o `npm run typecheck`).
   - Eseguire `git add .`.
   - Eseguire `git commit` con messaggio convenzionale chiaro (es. `release(vX.Y.Z): ...`).
   - Eseguire `git push origin main`.
