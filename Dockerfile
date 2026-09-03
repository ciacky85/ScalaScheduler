# ============================================================
# FASE 1: Installazione dipendenze Node.js
# ============================================================
FROM node:20-bookworm-slim AS node-deps
WORKDIR /app/scheduler
COPY scheduler/package.json scheduler/package-lock.json* ./
RUN npm install --no-audit --no-fund && npm cache clean --force

# ============================================================
# FASE 2: Build dell'applicazione Next.js standalone
# ============================================================
FROM node:20-bookworm-slim AS node-builder
WORKDIR /app/scheduler
COPY --from=node-deps /app/scheduler/node_modules ./node_modules
COPY scheduler ./

# Variabili dummy per il build Next.js
ENV GEMINI_API_KEY=dummy-build-key
ENV GOOGLE_GENAI_API_KEY=dummy-build-key

# Placeholder per la compilazione TypeScript
RUN mkdir -p src/app/config && \
    echo '{"type":"service_account","project_id":"build-placeholder","private_key_id":"","private_key":"-----BEGIN RSA PRIVATE KEY-----\nMIIBogIBAAJBALRiMLAHudeSA/x3hB2f+2NRkJlZ+Utk8GQv5MBbU+vYC5OULWF\njDKfcd7OGYJYOl+RbEwSjJPX/lt4e8NJfcECAwEAAQ==\n-----END RSA PRIVATE KEY-----\n","client_email":"build@build.iam.gserviceaccount.com","client_id":"0","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/build"}' > src/app/config/service-account-key.json

RUN npm run build && rm -rf .next/cache

# ============================================================
# FASE 3: Runtime Unificato (Node.js + Python Playwright)
# ============================================================
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    TZ=Europe/Rome \
    PORT=3000 \
    HOSTNAME="0.0.0.0" \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    SCHEDULER_API_URL=http://localhost:3000

# Installazione dipendenze di sistema per Python, Playwright Chromium e font
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    tzdata curl jq wget gnupg ca-certificates \
    fonts-liberation fonts-dejavu-core libnss3 libx11-6 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxrandr2 libxtst6 libdrm2 libgbm1 libasound2 \
    libatk-bridge2.0-0 libgtk-3-0 \
  && rm -rf /var/lib/apt/lists/*

# Configurazione timezone di sistema
RUN ln -sf /usr/share/zoneinfo/Europe/Rome /etc/localtime && echo Europe/Rome > /etc/timezone

# Creazione ambiente virtuale Python e installazione Playwright
COPY odg-docker-scraper/requirements.txt /app/scraper/requirements.txt
RUN python3 -m venv /app/scraper-venv && \
    /app/scraper-venv/bin/pip install --no-cache-dir -r /app/scraper/requirements.txt && \
    /app/scraper-venv/bin/python -m playwright install --with-deps chromium || /app/scraper-venv/bin/python -m playwright install chromium

# Copia file dello scraper Python
COPY odg-docker-scraper/drive_uploader.py /app/scraper/drive_uploader.py
COPY odg-docker-scraper/shots.py /app/scraper/shots.py
COPY odg-docker-scraper/main.py /app/scraper/main.py

# Copia build Next.js standalone
COPY --from=node-builder /app/scheduler/public ./public
COPY --from=node-builder /app/scheduler/.next/standalone ./
COPY --from=node-builder /app/scheduler/.next/static ./.next/static

# Copia script ausiliari e wrapper di avvio
COPY scheduler/cron-runner.js /app/cron-runner.js
COPY scheduler/run-cron.sh /app/run-cron.sh
COPY scheduler/entrypoint-wrapper.sh /app/entrypoint-wrapper.sh
RUN chmod +x /app/run-cron.sh /app/entrypoint-wrapper.sh

# Directory per volumi persistenti e compatibilità percorsi
RUN mkdir -p /app/config /data/odg_shots

VOLUME ["/app/config", "/data"]
EXPOSE 3000

ENTRYPOINT ["/app/entrypoint-wrapper.sh"]
