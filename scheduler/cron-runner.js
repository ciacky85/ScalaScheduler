const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');

const CANDIDATES = [
  '/app/public/odg_update_time.json',
  path.join(process.cwd(), 'src', 'app', 'config', 'odg_update_time.json'),
  path.join(process.cwd(), 'public', 'odg_update_time.json'),
];
const RUN   = process.env.RUN_CRON_SH   || '/app/run-cron.sh';
const DEF_TZ= process.env.TZ            || 'Europe/Rome';
const POLL  = parseInt(process.env.CRON_POLL_SEC || '15', 10);
const DEBUG = process.env.DEBUG_CRON === '1';

function loadCfg() {
  for (const p of CANDIDATES) {
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      return { p, j };
    } catch (_) {}
  }
  return { p: null, j: null };
}

function hhmm(tz) {
  const d = new Date();
  const s = d.toLocaleTimeString('it-IT', { timeZone: tz, hour12: false });
  const [h, m] = s.split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

function minuteKey(tz) {
  const d = new Date();
  const iso = d.toLocaleString('sv-SE', { timeZone: tz }).replace(' ', 'T');
  return iso.slice(0, 16);
}

function run() {
  exec(RUN, (err, stdout, stderr) => {
    if (err) console.error(`[cron-runner] ERROR: ${err.message}`);
    if (stdout && stdout.trim()) console.log(`[cron-runner] STDOUT: ${stdout.trim()}`);
    if (stderr && stderr.trim()) console.error(`[cron-runner] STDERR: ${stderr.trim()}`);
  });
}

let last = null;
console.log(`[cron-runner] Avviato. Poll ${POLL}s. RUN=${RUN}`);

function tick() {
  const { p, j } = loadCfg();
  const tz = (j && j.timezone) || DEF_TZ;
  const times = (j && Array.isArray(j.update_times)) ? j.update_times : [];
  const now = hhmm(tz);
  const key = minuteKey(tz);
  if (DEBUG) console.log(`[cron-runner] tick now=${now} tz=${tz} file=${p} times=${JSON.stringify(times)}`);
  if (times.includes(now) && key !== last) {
    console.log(`[cron-runner] Match ${now} (TZ=${tz}). Avvio ${RUN}`);
    last = key;
    run();
  }
}

setInterval(tick, POLL * 1000);
tick();
