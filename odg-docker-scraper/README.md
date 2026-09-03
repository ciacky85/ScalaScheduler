# ODG Scraper Engine (Python Playwright)

Motore di estrazione dati e acquisizione screenshot per i programmi di lavoro e gli Ordini del Giorno del Coro del Teatro alla Scala.

- **Tecnologie**: Python 3.11, Playwright Chromium headless, BeautifulSoup4, LXML, Pillow.
- **Funzionalità**:
  - Scraping autonomo delle pagine ERP (`pps=0` e `pps=1`).
  - Parsing avanzato delle tabelle, orari, luoghi, destinatari e note con asterisco `*`.
  - Cattura screenshot a tutta pagina con watermark timestamp e hash di verifica.
  - Sincronizzazione screenshot via API locali su Google Drive.
- **Integrazione**: A partire dalla versione `v2.0.0`, questo modulo è incorporato ed eseguito direttamente nel container unificato principale `ScalaScheduler` in ascolto locale su `http://localhost:3000`.

Per dettagli operativi e di deploy, consultare il [`README.md`](../README.md) alla radice del progetto.
