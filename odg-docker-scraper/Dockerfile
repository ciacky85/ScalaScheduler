FROM python:3.12-slim

ENV PIP_NO_CACHE_DIR=1 PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

ARG BUILD_TS
LABEL build.ts="${BUILD_TS}"

COPY main.py /app/main.py
VOLUME ["/data"]
ENV TZ=Europe/Rome
CMD ["python", "/app/main.py"]
