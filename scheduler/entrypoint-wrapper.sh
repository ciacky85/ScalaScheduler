#!/bin/sh
set -e

# Configurazione Timezone
ln -sf /usr/share/zoneinfo/Europe/Rome /etc/localtime 2>/dev/null || cp /usr/share/zoneinfo/Europe/Rome /etc/localtime 2>/dev/null || true
echo Europe/Rome >/etc/timezone 2>/dev/null || true
export TZ=Europe/Rome

# Assicura le directory dati e permessi
mkdir -p /data/odg_shots /app/config /app/public 2>/dev/null || true
chmod +x /app/run-cron.sh 2>/dev/null || true

# Avvio Scraper Python in background (se presente)
if [ -f "/app/scraper/main.py" ]; then
  echo "[entrypoint] Avvio ODG Scraper..."
  if [ -x "/app/scraper-venv/bin/python" ]; then
    PYTHON_CMD="/app/scraper-venv/bin/python"
  elif command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD="python3"
  else
    PYTHON_CMD="python"
  fi
  $PYTHON_CMD /app/scraper/main.py >> /data/odg-scraper.log 2>&1 &
fi

# Avvio Cron Runner in background
if [ -f "/app/cron-runner.js" ]; then
  echo "[entrypoint] Avvio cron-runner..."
  node /app/cron-runner.js >> /data/cron-runner.log 2>&1 &
fi

# Avvio Next.js WebApp (processo principale)
echo "[entrypoint] Avvio ScalaScheduler WebApp..."
if [ -f "/app/server.js" ]; then
  exec node /app/server.js
else
  exec npm start
fi
