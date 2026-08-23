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
RUN npm run build

# Fase 3: Esecuzione in produzione
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copia solo gli artefatti necessari per la produzione
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts

# La porta 3000 è quella di default per 'next start'
EXPOSE 3000

CMD ["npm", "start"]

# === Added: cron-runner integration ===
COPY cron-runner.js /app/cron-runner.js
COPY run-cron.sh /app/run-cron.sh
COPY entrypoint-wrapper.sh /app/entrypoint-wrapper.sh
RUN chmod +x /app/run-cron.sh /app/entrypoint-wrapper.sh
RUN apk add --no-cache tzdata curl jq
ENV TZ=Europe/Rome
ENTRYPOINT ["/app/entrypoint-wrapper.sh"]
