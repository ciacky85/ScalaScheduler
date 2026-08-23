#!/bin/sh
set -e
if command -v apk >/dev/null 2>&1; then
  apk add --no-cache tzdata curl jq >/dev/null 2>&1 || true
elif command -v apt-get >/dev/null 2>&1; then
  apt-get update >/dev/null 2>&1 || true
  DEBIAN_FRONTEND=noninteractive apt-get install -y tzdata curl jq >/dev/null 2>&1 || true
fi
ln -sf /usr/share/zoneinfo/Europe/Rome /etc/localtime 2>/dev/null || cp /usr/share/zoneinfo/Europe/Rome /etc/localtime 2>/dev/null || true
echo Europe/Rome >/etc/timezone || true
export TZ=Europe/Rome
chmod +x /app/run-cron.sh 2>/dev/null || true
node /app/cron-runner.js >> /app/cron-runner.log 2>&1 &
exec npm start
