# ODG Scraper Engine (Python Playwright) — v2.1.0

Motore di estrazione dati, acquisizione screenshot, rilevamento modifiche visuali (diffing) e trigger auto-sync per i programmi di lavoro e gli Ordini del Giorno del Coro del Teatro alla Scala.

- **Tecnologie**: Python 3.11, Playwright Chromium headless, BeautifulSoup4, LXML, Pillow.
- **Funzionalità v2.1.0**:
  - **Scraping ERP autonomo**: lettura delle pagine del portale (`pps=0` e `pps=1`).
  - **Parsing e Normalizzazione**: estrazione strutturata di tabelle, orari con 8 livelli di fallback, luoghi normalizzati, destinatari e note con asterisco `*`.
  - **Visual Diffing & Shot Management (`shots.py`)**:
    - Generazione della baseline giornaliera alle 00:02 (`YYYY-MM-DD.png`).
    - Hashing HTML/testo delle pagine (`last_page_hashes`): se il contenuto varia durante i successivi cicli diurni, cattura lo screenshot di revisione con suffisso `_edit.png` (`YYYY-MM-DD_HHmm_edit.png`).
    - Salta gli scatti ridondanti se il contenuto della pagina è identico allo scatto precedente.
    - Watermark orario e timestamp applicato a ciascuno screenshot.
  - **Pipeline di Auto-Sync Locale**:
    - Trigger sequenziale automatico: Scraping ➔ Diffing Screenshot ➔ Invio sync Google Calendar (`POST http://localhost:3000/api/odg/auto-sync`) ➔ Upload / verifica Google Drive (`POST http://localhost:3000/api/screenshots/sync`).
- **Integrazione**: Questo modulo è eseguito direttamente nel container unificato `ScalaScheduler` in ascolto locale su `http://localhost:3000`.

Per dettagli operativi e di deploy, consultare il [`README.md`](../README.md) alla radice del progetto.

