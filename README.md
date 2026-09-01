# ScalaScheduler — Chorus Calendar Sync & ODG Scraper

Applicazione integrata per l'estrazione automatica dei programmi di lavoro e degli Ordini del Giorno (ODG) del **Coro del Teatro alla Scala**, sincronizzazione su **Google Calendar** tramite Service Account e archiviazione degli screenshot su **Google Drive**.

---

## 🌟 Caratteristiche Principali

1. **Importa Calendario (PDF Quindicinale)**:
   - Parsing client-side con `pdfjs-dist`.
   - Riconoscimento intelligente delle date, fasce orarie, luoghi e note a piè di pagina con asterischi `*`.
   - Tabella eventi interamente modificabile (data, luogo, descrizione, fasce orarie).
   - Esportazione massiva su Google Calendar con gestione automatica slot orari ed eventi di una giornata intera.

2. **ODG (Ordine del Giorno da Web)**:
   - Visualizzazione dei dati estratti in tempo reale dalle pagine ERP della Scala.
   - Sincronizzazione intelligente idempotente (upsert basato su SHA-1 content hash e UID univoco).
   - Modalità **Dry Run** per simulare le modifiche prima di applicarle a Google Calendar.

3. **ODG Scraper Manager (Area Amministratore)**:
   - Gestione centralizzata della configurazione dello scraper Python: URL target, orari schedulati (`schedules`), toggle `run_on_start`.
   - **Scraping on-demand**: pulsante per forzare l'aggiornamento immediato dei dati senza attendere il cron.
   - Monitoraggio in tempo reale: data ultimo export, righe estratte e stato dei file.

4. **Archiviazione Screenshot su Google Drive**:
   - Salvataggio automatico degli screenshot su cartella Google Drive condivisa con il Service Account.
   - Opzione per attivare/disattivare il salvataggio duplicato in locale (`salvaAncheInLocale`).
   - Verifica automatica dei permessi e connessione alla cartella Google Drive dall'interfaccia.

---

## 🏗️ Architettura & Stack Tecnologico

- **Frontend & API**: Next.js 15 (App Router), React 18, TypeScript, TailwindCSS, shadcn/ui, Radix UI.
- **Integrazioni Google**: `googleapis`, `google-auth-library` (JWT con Service Account).
- **AI Error Diagnostic**: Google Genkit (`gemini-2.5-flash`).
- **ODG Scraper**: Python 3.12, BeautifulSoup4, LXML.
- **Orchestrazione**: Docker Compose / Portainer.

```mermaid
graph LR
    subgraph "Docker Container: odg-scraper"
        A["ODG Scraper<br/>(Python)"]
    end
    subgraph "Docker Container: ScalaScheduler"
        B["Scheduler App<br/>(Next.js)"]
        C["Cron Runner<br/>(Node.js)"]
    end
    subgraph "Servizi Esterni"
        D["Teatro alla Scala<br/>ERP Web"]
        E["Google Calendar API"]
        F["Google Drive API"]
        G["Gemini AI (Genkit)"]
    end

    D -->|"Scraping HTML"| A
    A -->|"odg_structured.json"| B
    B -->|"Google Calendar API"| E
    B -->|"Upload Screenshot"| F
    B -->|"Diagnostic Report"| G
    C -->|"Sync POST"| B
```

---

## 🚀 Deploy su Portainer (Stack da Repository)

Il progetto è configurato come **Monorepo** per essere deployato direttamente da Portainer tramite la funzione **Stacks > Add stack > Repository**.

### 1. Parametri Stack Portainer
- **Repository URL**: `https://github.com/ciacky85/ScalaScheduler.git`
- **Repository reference**: `refs/heads/main`
- **Compose path**: `docker-compose.yml`

### 2. Mappatura Volumi Host (NAS / Linux Server)
Assicurati che sul tuo host siano presenti le directory:
- `/srv/docker_conf/configs/ScalaScheduler/config` (configurazioni calendari, drive, service-account-key.json)
- `/srv/docker_conf/configs/ScalaScheduler/odg-scraper/config` (file `odg_structured.json`, `config.json`, screenshot)

### 3. File `docker-compose.yml` dello Stack:
```yaml
version: '3.8'

services:
  scala-scheduler:
    build:
      context: ./scheduler
      dockerfile: Dockerfile
    image: ciacky85/scala-scheduler:latest
    container_name: ScalaScheduler
    restart: always
    ports:
      - "3010:3000"
    environment:
      - TZ=Europe/Rome
      - NODE_ENV=production
    volumes:
      - /srv/docker_conf/configs/ScalaScheduler/config:/app/config
      - /srv/docker_conf/configs/ScalaScheduler/config:/app/src/app/config
      - /srv/docker_conf/configs/ScalaScheduler/odg-scraper/config:/app/public
    depends_on:
      - odg-scraper

  odg-scraper:
    build:
      context: ./odg-docker-scraper
      dockerfile: Dockerfile
    image: ciacky85/odg-scraper:latest
    container_name: odg-scraper
    restart: always
    environment:
      - TZ=Europe/Rome
    volumes:
      - /srv/docker_conf/configs/ScalaScheduler/odg-scraper/config:/data
```

---

## 🔐 Configurazione Google Service Account

1. Posiziona la chiave privata JSON scaricata da Google Cloud Console nel percorso:
   ```
   /srv/docker_conf/configs/ScalaScheduler/config/service-account-key.json
   ```
2. **Google Calendar**: Condividi i tuoi calendari di destinazione con l'email del Service Account (`calendar-scheduler@...iam.gserviceaccount.com`) assegnando i permessi di **"Modifica agli eventi"**.
3. **Google Drive**: Condividi la cartella di destinazione degli screenshot con la stessa email del Service Account con ruolo **"Editor"**, quindi incolla il link della cartella nel tab **Impostazioni** della webapp.

---

## 📖 Documentazione Completa
Per l'analisi dettagliata di ogni modulo, algoritmo di parsing e logica di sincronizzazione, consulta il file [`ANALISI_TECNICA.md`](./ANALISI_TECNICA.md).
