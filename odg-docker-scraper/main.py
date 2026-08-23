import os
import re
import json
import time
import signal
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

TZ_NAME = os.environ.get("TZ", "Europe/Rome")
TZ = ZoneInfo(TZ_NAME)

CONFIG_PATH = "/data/config.json"
DEFAULT_CONFIG = {
    "urls": [
        "https://erp.teatroallascala.org/pianificazione11/faces/DSSC/pxf_dspagine_coro.xhtml?pps=0",
        "https://erp.teatroallascala.org/pianificazione11/faces/DSSC/pxf_dspagine_coro.xhtml?pps=1"
    ],
    "output_file": "/data/odg_structured.json",
    "schedules": ["07:00", "21:00"],
    "run_on_start": True
}

IT_MONTHS = {
    "GENNAIO":1,"FEBBRAIO":2,"MARZO":3,"APRILE":4,"MAGGIO":5,"GIUGNO":6,
    "LUGLIO":7,"AGOSTO":8,"SETTEMBRE":9,"OTTOBRE":10,"NOVEMBRE":11,"DICEMBRE":12
}

DATE_HEADER_RE = re.compile(
    r"(LUNEDÌ|MARTEDÌ|MERCOLEDÌ|GIOVEDÌ|VENERDÌ|SABATO|DOMENICA)\s+(\d{1,2})\s+([A-ZÀ-Ú]+)\s+(\d{4})"
)
LAST_UPDATE_RE = re.compile(r"Agg\.?\s*(\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2})", re.IGNORECASE)
TIME_RANGE_RE = re.compile(r"\b([01]?\d|2[0-3]):([0-5]\d)\s*[-–—]\s*([01]?\d|2[0-3]):([0-5]\d)\b")
TIME_RE = re.compile(r"\b([01]?\d|2[0-3]):([0-5]\d)\b")

def log(msg: str):
    print(f"[{datetime.now(TZ).isoformat(timespec='seconds')}] {msg}", flush=True)

def load_config():
    cfg = dict(DEFAULT_CONFIG)
    try:
        if os.path.exists(CONFIG_PATH):
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                user = json.load(f)
            if isinstance(user, dict):
                cfg.update(user)
    except Exception as e:
        log(f"WARNING: errore lettura config: {e}. Uso default.")
    norm = []
    for s in cfg.get("schedules", []):
        m = re.match(r"^(\d{1,2}):(\d{2})$", str(s).strip())
        if not m: 
            continue
        h, mi = int(m.group(1)), int(m.group(2))
        if 0 <= h < 24 and 0 <= mi < 60:
            norm.append(f"{h:02d}:{mi:02d}")
    cfg["schedules"] = norm or DEFAULT_CONFIG["schedules"]
    return cfg

def parse_date_header(text: str):
    m = DATE_HEADER_RE.search(text.upper())
    if not m:
        return {"label": None, "iso": None}
    day = int(m.group(2)); month_name = m.group(3).upper(); year = int(m.group(4))
    month = IT_MONTHS.get(month_name)
    iso = f"{year:04d}-{month:02d}-{day:02d}" if month else None
    return {"label": m.group(0).title(), "iso": iso}

def parse_last_update(text: str):
    m = LAST_UPDATE_RE.search(text)
    if not m:
        return {"raw": None, "iso": None}
    raw = "Agg. " + m.group(1)
    try:
        from datetime import datetime as _dt
        dt = _dt.strptime(m.group(1), "%d/%m/%Y %H:%M").replace(tzinfo=TZ)
        iso = dt.isoformat(timespec="minutes")
    except Exception:
        iso = None
    return {"raw": raw, "iso": iso}

def fetch_html(url: str) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 (ODG-Scraper/2.3)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
    }
    for i in range(3):
        try:
            r = requests.get(url, headers=headers, timeout=60)
            r.raise_for_status()
            return r.text
        except Exception as e:
            log(f"Fetch fallito ({i+1}/3) {url}: {e}")
            time.sleep(2 * (i+1))
    raise RuntimeError(f"Impossibile scaricare {url}")

def table_rows_from_html(html: str):
    soup = BeautifulSoup(html, "lxml")
    rows = []
    for tr in soup.find_all("tr"):
        cells = [c.get_text(" ", strip=True) for c in tr.find_all(["th","td"])]
        cells = [c for c in cells if c]
        if cells:
            rows.append(cells)
    if not rows:
        text = soup.get_text("\n", strip=True)
        candidates = [ln for ln in text.split("\n") if TIME_RE.search(ln)]
        for ln in candidates:
            parts = [p.strip() for p in re.split(r"\s*\|\s*", ln) if p.strip()]
            if len(parts) >= 3:
                if len(parts) == 3:
                    parts.append("")
                rows.append(parts[:4])
    return rows, soup.get_text(" ", strip=True)

def classify_place(raw_place: str):
    lp = raw_place.lower()
    if "ansaldo" in lp: return "ansaldo"
    if "sala" in lp: return "sala"
    if "teatro" in lp: return "teatro"
    if "ridotto" in lp: return "ridotto"
    if "palco" in lp: return "palco"
    if "studio" in lp: return "studio"
    return "altro"

def normalize_cap(s: str):
    s = s.strip()
    if not s: return s
    return " ".join(w.capitalize() if w.isalpha() else w for w in s.split())

def parse_time_range(raw: str):
    m = TIME_RANGE_RE.search(raw.replace("–","-").replace("—","-"))
    if m:
        start = f"{int(m.group(1)):02d}:{m.group(2)}"
        end   = f"{int(m.group(3)):02d}:{m.group(4)}"
        return {"raw": m.group(0).replace("–","-").replace("—","-"), "start": start, "end": end, "tz": TZ.key}
    m2 = TIME_RE.search(raw)
    if m2:
        start = f"{int(m2.group(1)):02d}:{m2.group(2)}"
        return {"raw": start, "start": start, "end": None, "tz": TZ.key}
    return {"raw": raw.strip(), "start": None, "end": None, "tz": TZ.key}

def row_to_struct(row_cells):
    cells = list(row_cells) + [""]*4
    recipient = cells[0].strip()
    place_raw = cells[1].strip()
    time_raw = cells[2].strip()
    desc_raw = cells[3].strip()

    flags = []
    if "*" in desc_raw:
        flags.append("asterisk")

    details = []
    title = desc_raw
    if " - " in desc_raw:
        parts = [p.strip() for p in desc_raw.split(" - ") if p.strip()]
        if parts:
            title = parts[0]
            details = parts[1:]

    return {
        "recipient": {
            "raw": recipient,
            "normalized": normalize_cap(recipient) if recipient else None,
            "category": "coro" if "coro" in recipient.lower() else None
        },
        "place": {
            "raw": place_raw,
            "normalized": normalize_cap(place_raw) if place_raw else None,
            "location_type": classify_place(place_raw) if place_raw else None
        },
        "time": parse_time_range(time_raw),
        "description": {
            "raw": desc_raw,
            "title": title if title else None,
            "details": details,
            "flags": flags
        },
        "provenance": {
            "tokens": [recipient, place_raw, time_raw, desc_raw]
        }
    }

def extract_page(url: str):
    html = fetch_html(url)
    rows_raw, full_text = table_rows_from_html(html)
    date_info = parse_date_header(full_text)
    last_upd = parse_last_update(full_text)

    structured_rows = []
    for rc in rows_raw:
        joined = " | ".join(rc)
        if not TIME_RE.search(joined):
            continue
        structured_rows.append(row_to_struct(rc))

    table_obj = {
        "columns": [
            {"key":"recipient","label":"Destinatario"},
            {"key":"place","label":"Luogo"},
            {"key":"time","label":"Fascia oraria"},
            {"key":"description","label":"Descrizione"}
        ],
        "rows": [
            { "row_index": i, **r } for i, r in enumerate(structured_rows)
        ]
    }

    return {
        "source_url": url,
        "date": date_info,
        "last_update": last_upd,
        "table": table_obj,
        "stats": { "row_count": len(structured_rows) }
    }

def run_once(cfg):
    pages = []
    for url in cfg.get("urls", [])[:2]:
        try:
            log(f"Analisi pagina: {url}")
            pages.append(extract_page(url))
        except Exception as e:
            log(f"ERRORE pagina {url}: {e}")
            pages.append({
                "source_url": url,
                "date": {"label": None, "iso": None},
                "last_update": {"raw": None, "iso": None},
                "table": {"columns": [], "rows": []},
                "stats": {"row_count": 0}
            })
    payload = {
        "export_generated_at": datetime.now(TZ).isoformat(timespec="seconds"),
        "pages": pages
    }
    out = cfg.get("output_file", "/data/odg_structured.json")
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    log(f"Scritto JSON: {out} (pagine={len(pages)}, righe_totali={sum(p['stats']['row_count'] for p in pages)})")

def seconds_until_next(now, hhmm_list):
    today = now.date()
    candidates = []
    for hhmm in hhmm_list:
        h, m = map(int, hhmm.split(":"))
        dt = datetime(today.year, today.month, today.day, h, m, tzinfo=TZ)
        if dt > now:
            candidates.append(dt)
    if not candidates:
        for hhmm in hhmm_list:
            h, m = map(int, hhmm.split(":"))
            dt = datetime(today.year, today.month, today.day, h, m, tzinfo=TZ) + timedelta(days=1)
            candidates.append(dt)
    nxt = min(candidates)
    return max(1, int((nxt - now).total_seconds()))

def main():
    cfg = load_config()
    log(f"Config: {json.dumps(cfg, ensure_ascii=False)} (TZ={TZ.key})")
    if cfg.get("run_on_start", True):
        run_once(cfg)

    stop = False
    def _sig(*_a):
        nonlocal stop
        stop = True
    signal.signal(signal.SIGINT, _sig); signal.signal(signal.SIGTERM, _sig)

    while not stop:
        try:
            wait_s = seconds_until_next(datetime.now(TZ), cfg.get("schedules", []))
            log(f"Prossima esecuzione tra ~{wait_s//3600}h {wait_s%3600//60}m")
            for _ in range(wait_s):
                if stop:
                    break
                time.sleep(1)
            if stop:
                break
            run_once(cfg)
        except Exception as e:
            log(f"Errore loop: {e}")
            time.sleep(10)

if __name__ == "__main__":
    main()
