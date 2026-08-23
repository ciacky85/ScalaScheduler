#!/bin/sh
set -e
API_ENDPOINT="${API_ENDPOINT:-http://localhost:3000/api/odg/cron}"
echo "[run-cron] POST a ${API_ENDPOINT} @ $(date -Iseconds)"
n=0
until [ $n -ge 3 ]
do
  if curl -sS -X POST -H "Content-Type: application/json" "$API_ENDPOINT" --fail; then
    echo "[run-cron] OK $(date -Iseconds)"
    exit 0
  fi
  n=$((n+1)); echo "[run-cron] retry $n..."; sleep 5
done
echo "[run-cron] ERRORE: endpoint non raggiungibile"; exit 1
