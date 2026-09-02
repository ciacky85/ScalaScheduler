FROM python:3.11-slim

ENV PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TZ=Europe/Rome

# Dipendenze di sistema per Playwright Chromium e font per watermark
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget gnupg ca-certificates \
    fonts-liberation fonts-dejavu-core libnss3 libx11-6 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxrandr2 libxtst6 libdrm2 libgbm1 libasound2 \
    libatk-bridge2.0-0 libgtk-3-0 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Installa il browser Chromium per Playwright
RUN python -m playwright install --with-deps chromium || python -m playwright install chromium

ARG BUILD_TS
LABEL build.ts="${BUILD_TS}"

COPY drive_uploader.py /app/drive_uploader.py
COPY shots.py /app/shots.py
COPY main.py /app/main.py

# Crea directory dati e compatibilità per percorsi /app/public
RUN mkdir -p /data /config && ln -s /data /app/public 2>/dev/null || true

VOLUME ["/data"]

CMD ["python", "/app/main.py"]
