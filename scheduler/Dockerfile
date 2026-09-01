# Fase 1: Installazione delle dipendenze
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

# Fase 2: Build dell'applicazione
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Fornisci variabili dummy per il build (genkit/google-ai)
# Le variabili reali vengono montate a runtime tramite i volumi Docker
ENV GEMINI_API_KEY=dummy-build-key
ENV GOOGLE_GENAI_API_KEY=dummy-build-key

# Crea un service-account-key.json fittizio per la compilazione
# Il file reale sarà montato via volume Docker in /app/config/ a runtime
RUN mkdir -p src/app/config && \
    echo '{"type":"service_account","project_id":"build-placeholder","private_key_id":"","private_key":"-----BEGIN RSA PRIVATE KEY-----\nMIIBogIBAAJBALRiMLAHudeSA/x3hB2f+2NRkJlZ+Utk8GQv5MBbU+vYC5OULWF\njDKfcd7OGYJYOl+RbEwSjJPX/lt4e8NJfcECAwEAAQ==\n-----END RSA PRIVATE KEY-----\n","client_email":"build@build.iam.gserviceaccount.com","client_id":"0","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/build"}' > src/app/config/service-account-key.json

RUN npm run build

# Fase 3: Esecuzione in produzione
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV TZ=Europe/Rome

# Installa dipendenze di sistema
RUN apk add --no-cache tzdata curl jq

# Copia solo gli artefatti necessari per la produzione
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts

# Copia file cron e entrypoint
COPY cron-runner.js /app/cron-runner.js
COPY run-cron.sh /app/run-cron.sh
COPY entrypoint-wrapper.sh /app/entrypoint-wrapper.sh
RUN chmod +x /app/run-cron.sh /app/entrypoint-wrapper.sh

# Crea le directory config per i bind mount
RUN mkdir -p /app/config /app/src/app/config

# La porta 3000 è quella di default per 'next start'
EXPOSE 3000

ENTRYPOINT ["/app/entrypoint-wrapper.sh"]
