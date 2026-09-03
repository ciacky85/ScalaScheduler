import os
import re
import json
import time
import signal
import hashlib
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from shots import maybe_capture

TZ_NAME = os.environ.get("TZ", "Europe/Rome")
TZ = ZoneInfo(TZ_NAME)

CONFIG_PATHS = [
    Path(os.environ.get("CONFIG_PATH", "/data/config.json")),
    Path("/data/config.json"),
    Path("/config/config.json"),
    Path("/app/public/config.json"),
]

DEFAULT_CONFIG = {
    "urls": [
        {"name": "odg_0", "url": "https://erp.teatroallascala.org/pianificazione11/faces/DSSC/pxf_dspagine_coro.xhtml?pps=0"},
        {"name": "odg_1", "url": "https://erp.teatroallascala.org/pianificazione11/faces/DSSC/pxf_dspagine_coro.xhtml?pps=1"}
    ],
    "output_file": "/data/odg_structured.json",
    "screenshots_dir": "/data/odg_shots",
    "enable_screenshots": True,
    "schedules": ["07:00", "21:00"],
    "poll_minutes": 10,
    "run_on_start": True
}

IT_MONTHS = {
    "GENNAIO": 1, "FEBBRAIO": 2, "MARZO": 3, "APRILE": 4, "MAGGIO": 5, "GIUGNO": 6,
    "LUGLIO": 7, "AGOSTO": 8, "SETTEMBRE": 9, "OTTOBRE": 10, "NOVEMBRE": 11, "DICEMBRE": 12
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
    for p in CONFIG_PATHS:
        if p.exists():
            try:
                with open(p, "r", encoding="utf-8") as f:
                    user = json.load(f)
                if isinstance(user, dict):
                    cfg.update(user)
                    log(f"Config caricata con successo da: {p}")
                    break
            except Exception as e:
                log(f"WARNING: errore lettura config ({p}): {e}")
    
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
    day = int(m.group(2))
    month_name = m.group(3).upper()
    year = int(m.group(4))
    month = IT_MONTHS.get(month_name)
    iso = f"{year:04d}-{month:02d}-{day:02d}" if month else None
    return {"label": m.group(0).title(), "iso": iso}

def parse_last_update(text: str):
    m = LAST_UPDATE_RE.search(text)
    if not m:
        return {"raw": None, "iso": None}
    raw = "Agg. " + m.group(1)
    try:
        dt = datetime.strptime(m.group(1), "%d/%m/%Y %H:%M").replace(tzinfo=TZ)
        iso = dt.isoformat(timespec="minutes")
    except Exception:
        iso = None
    return {"raw": raw, "iso": iso}

def fetch_html(url: str) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 (ODG-Scraper/3.0)",
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
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"Impossibile scaricare {url}")

def clean_footnote(fn: str) -> str:
    s = re.sub(r"^(?:Note|Nota)\s*:\s*", "", fn, flags=re.IGNORECASE).strip()
    s = re.sub(r"^\*+\s*", "", s).strip()
    s = re.sub(r"\s+", " ", s)
    return s

def table_rows_from_html(html: str):
    soup = BeautifulSoup(html, "lxml")
    rows = []
    footnotes = []

    for tr in soup.find_all("tr"):
        cells = [c.get_text(" ", strip=True) for c in tr.find_all(["th", "td"])]
        cells = [c for c in cells if c]
        if not cells:
            continue

        row_text = " ".join(cells).strip()
        if re.match(r"^(?:Note|Nota)\b", row_text, re.IGNORECASE) or (len(cells) == 1 and row_text.startswith("*")):
            note_content = re.sub(r"^(?:Note|Nota)\s*:\s*", "", row_text, flags=re.IGNORECASE).strip()
            if note_content and note_content not in footnotes:
                footnotes.append(note_content)
            continue

        rows.append(cells)

    full_text = soup.get_text("\n", strip=True)

    for line in full_text.split("\n"):
        line_clean = line.strip()
        if not line_clean:
            continue
        m_note = re.match(r"^(?:Note|Nota)\s*:\s*(.+)$", line_clean, re.IGNORECASE)
        if m_note:
            note_content = m_note.group(1).strip()
            if note_content and note_content not in footnotes:
                footnotes.append(note_content)
        elif line_clean.startswith("*") and len(line_clean) > 3:
            if not any(line_clean == c for r in rows for c in r):
                if line_clean not in footnotes:
                    footnotes.append(line_clean)

    if not rows:
        candidates = [ln for ln in full_text.split("\n") if TIME_RE.search(ln)]
        for ln in candidates:
            if re.match(r"^(?:Note|Nota)\b", ln, re.IGNORECASE):
                continue
            parts = [p.strip() for p in re.split(r"\s*\|\s*", ln) if p.strip()]
            if len(parts) >= 3:
                if len(parts) == 3:
                    parts.append("")
                rows.append(parts[:4])

    return rows, soup.get_text(" ", strip=True), footnotes

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
    m = TIME_RANGE_RE.search(raw.replace("–", "-").replace("—", "-"))
    if m:
        start = f"{int(m.group(1)):02d}:{m.group(2)}"
        end = f"{int(m.group(3)):02d}:{m.group(4)}"
        return {"raw": m.group(0).replace("–", "-").replace("—", "-"), "start": start, "end": end, "tz": TZ.key}
    m2 = TIME_RE.search(raw)
    if m2:
        start = f"{int(m2.group(1)):02d}:{m2.group(2)}"
        return {"raw": start, "start": start, "end": None, "tz": TZ.key}
    return {"raw": raw.strip(), "start": None, "end": None, "tz": TZ.key}

def row_to_struct(row_cells, footnotes=None):
    cells = list(row_cells) + [""] * 4
    recipient = cells[0].strip()
    place_raw = cells[1].strip()
    time_raw = cells[2].strip()
    desc_raw = cells[3].strip()

    if "*" in desc_raw or "*" in place_raw or "*" in recipient:
        if footnotes:
            cleaned_notes = []
            desc_lower = desc_raw.lower()
            for fn in footnotes:
                clean_fn = clean_footnote(fn)
                if clean_fn and clean_fn.lower() not in desc_lower:
                    cleaned_notes.append(clean_fn)

            if cleaned_notes:
                notes_text = " - ".join(cleaned_notes)
                if desc_raw.endswith("-"):
                    desc_raw = f"{desc_raw} {notes_text}"
                else:
                    desc_raw = f"{desc_raw} - {notes_text}"
                desc_raw = re.sub(r"\s+", " ", desc_raw).strip()

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

def canonical_hash(parsed: dict) -> str:
    rows = []
    for r in (parsed.get("table") or {}).get("rows", []):
        rows.append({
            "row_index": r.get("row_index"),
            "recipient": (r.get("recipient") or {}).get("raw"),
            "place": (r.get("place") or {}).get("raw"),
            "time": (r.get("time") or {}).get("raw"),
            "desc": (r.get("description") or {}).get("raw"),
        })
    core = {
        "date_label": (parsed.get("date") or {}).get("label"),
        "date_iso": (parsed.get("date") or {}).get("iso"),
        "last_update": (parsed.get("last_update") or {}).get("raw"),
        "rows": rows,
    }
    return hashlib.sha256(json.dumps(core, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()

def extract_page(url: str):
    html = fetch_html(url)
    rows_raw, full_text, footnotes = table_rows_from_html(html)
    date_info = parse_date_header(full_text)
    last_upd = parse_last_update(full_text)

    structured_rows = []
    for rc in rows_raw:
        joined = " | ".join(rc)
        if not TIME_RE.search(joined):
            continue
        structured_rows.append(row_to_struct(rc, footnotes=footnotes))

    table_obj = {
        "columns": [
            {"key": "recipient", "label": "Destinatario"},
            {"key": "place", "label": "Luogo"},
            {"key": "time", "label": "Fascia oraria"},
            {"key": "description", "label": "Descrizione"}
        ],
        "rows": [
            {"row_index": i, **r} for i, r in enumerate(structured_rows)
        ]
    }

    return {
        "source_url": url,
        "date": date_info,
        "last_update": last_upd,
        "table": table_obj,
        "stats": {"row_count": len(structured_rows)}
    }

def resolve_url_name(raw_item: any, idx: int) -> tuple[str, str]:
    if isinstance(raw_item, dict):
        url = raw_item.get("url") or ""
        name = raw_item.get("name") or ""
    else:
        url = str(raw_item)
        name = ""

    if not name:
        if "pps=0" in url:
            name = "odg_0"
        elif "pps=1" in url:
            name = "odg_1"
        else:
            name = f"page_{idx}"

    return url, name

def run_once(cfg: dict):
    pages = []
    raw_urls = cfg.get("urls", [])
    
    shots_cfg = cfg.get("screenshots", {})
    if isinstance(shots_cfg, dict):
        enable_shots = shots_cfg.get("enabled", cfg.get("enable_screenshots", True))
        raw_shots_dir = shots_cfg.get("output_dir") or cfg.get("screenshots_dir") or "/data/odg_shots"
    else:
        enable_shots = cfg.get("enable_screenshots", True)
        raw_shots_dir = cfg.get("screenshots_dir") or "/data/odg_shots"

    raw_str = str(raw_shots_dir)
    if raw_str.startswith("/app/public"):
        raw_str = "/data" + raw_str[len("/app/public"):]
    shots_dir = Path(raw_str)

    log(f"Inizio scraping (enable_screenshots={enable_shots}, dir={shots_dir}, urls={len(raw_urls)})")

    for idx, raw_item in enumerate(raw_urls):
        url, name = resolve_url_name(raw_item, idx)
        if not url:
            continue

        try:
            log(f"Analisi pagina [{name}]: {url}")
            page_data = extract_page(url)
            pages.append(page_data)

            # Esegui la cattura dello screenshot (baseline / edit)
            if enable_shots:
                try:
                    c_hash = canonical_hash(page_data)
                    maybe_capture(
                        url=url,
                        url_name=name,
                        output_dir=shots_dir,
                        html_hash=c_hash,
                        full_page=True,
                        tzname=TZ_NAME,
                    )
                except Exception as shot_err:
                    log(f"WARNING screenshot [{name}]: {shot_err}")

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
    if str(out).startswith("/app/public"):
        out = "/data" + str(out)[len("/app/public"):]
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
    signal.signal(signal.SIGINT, _sig)
    signal.signal(signal.SIGTERM, _sig)

    trigger_paths = [
        Path("/data/trigger_run"),
        Path("/app/public/trigger_run"),
        Path("trigger_run"),
    ]

    while not stop:
        try:
            wait_s = seconds_until_next(datetime.now(TZ), cfg.get("schedules", []))
            log(f"Prossima esecuzione pianificata tra ~{wait_s//3600}h {wait_s%3600//60}m")
            for _ in range(wait_s):
                if stop:
                    break
                triggered = False
                for tp in trigger_paths:
                    if tp.exists():
                        try:
                            tp.unlink(missing_ok=True)
                        except Exception:
                            pass
                        log("Trigger manuale rilevato da webapp! Avvio immediato scraping e screenshot...")
                        cfg = load_config()
                        run_once(cfg)
                        triggered = True
                        break
                if triggered:
                    break
                time.sleep(1)
            if stop:
                break
            if not triggered:
                run_once(cfg)
        except Exception as e:
            log(f"Errore loop: {e}")
            time.sleep(10)

if __name__ == "__main__":
    main()
