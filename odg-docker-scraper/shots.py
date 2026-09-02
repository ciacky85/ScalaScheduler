from __future__ import annotations
import os
import json
import datetime
from pathlib import Path
from typing import Dict, Any, Optional

from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont
from dateutil import tz as dateutil_tz

try:
    from drive_uploader import handle_screenshot
except ImportError:
    try:
        from .drive_uploader import handle_screenshot
    except Exception:
        handle_screenshot = None

def now_in_tz(tzname: str = "Europe/Rome") -> datetime.datetime:
    tz = dateutil_tz.gettz(tzname) or dateutil_tz.gettz("Europe/Rome")
    return datetime.datetime.now(tz)

def now_in_tz_str(tzname: str = "Europe/Rome") -> str:
    return now_in_tz(tzname).strftime("%Y-%m-%d %H:%M:%S")

def today_str(tzname: str = "Europe/Rome") -> str:
    return now_in_tz(tzname).strftime("%Y-%m-%d")

def ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)

def load_state(state_path: Path) -> Dict[str, Any]:
    if state_path.exists():
        try:
            data = json.loads(state_path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                if "last" not in data:
                    return {"last": data}
                return data
        except Exception:
            return {"last": {}}
    return {"last": {}}

def save_state(state_path: Path, data: Dict[str, Any]) -> None:
    ensure_dir(state_path.parent)
    state_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

def _measure_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont):
    if hasattr(draw, "textbbox"):
        bbox = draw.textbbox((0, 0), text, font=font)
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        return w, h
    try:
        w, h = draw.textsize(text, font=font)
    except Exception:
        w = len(text) * 10
        h = 20
    return w, h

def _annotate_timestamp(filepath: Path, tzname: str) -> None:
    try:
        img = Image.open(filepath).convert("RGBA")
        draw = ImageDraw.Draw(img, "RGBA")

        stamp = f"{now_in_tz_str(tzname)} {tzname}"

        font = None
        for font_candidate in [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
            "DejaVuSans-Bold.ttf",
            "arial.ttf"
        ]:
            try:
                font = ImageFont.truetype(font_candidate, 36)
                break
            except Exception:
                continue
        if not font:
            font = ImageFont.load_default()

        text_w, text_h = _measure_text(draw, stamp, font)

        pad_x = 18
        pad_y = 12

        x1 = img.width - 40
        y1 = img.height - 40
        x0 = x1 - text_w - pad_x * 2
        y0 = y1 - text_h - pad_y * 2

        box_color = (0, 180, 0, 200)
        border_color = (0, 255, 0, 255)
        text_color = (255, 255, 255, 255)

        draw.rectangle((x0, y0, x1, y1), fill=box_color, outline=border_color, width=4)
        draw.text((x0 + pad_x, y0 + pad_y), stamp, font=font, fill=text_color)

        img = img.convert("RGB")
        img.save(filepath)
        print(f"[watermark] OK su {filepath}")
    except Exception as e:
        print("[watermark] FAILED:", repr(e))

def take_screenshot(
    url: str,
    filepath: Path,
    full_page: bool = True,
    timeout_ms: int = 60000,
    tzname: str = "Europe/Rome",
) -> bytes:
    ensure_dir(filepath.parent)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"])
        try:
            page = browser.new_page(
                viewport={"width": 1366, "height": 910, "deviceScaleFactor": 1}
            )
            # Carica la pagina in modo resiliente
            page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            try:
                page.wait_for_load_state("networkidle", timeout=10000)
            except Exception:
                pass
            page.wait_for_timeout(2000)
            page.screenshot(path=str(filepath), full_page=full_page)
        finally:
            browser.close()

    _annotate_timestamp(filepath, tzname)
    return filepath.read_bytes()

def _is_within_window(tzname: str, start_str: str, end_str: str) -> bool:
    now = now_in_tz(tzname)
    try:
        sh, sm = map(int, start_str.split(":"))
        eh, em = map(int, end_str.split(":"))
    except Exception:
        return True

    start_minutes = sh * 60 + sm
    end_minutes = eh * 60 + em
    now_minutes = now.hour * 60 + now.minute

    if start_minutes <= end_minutes:
        return start_minutes <= now_minutes <= end_minutes
    else:
        return now_minutes >= start_minutes or now_minutes <= end_minutes

def maybe_capture(
    url: str,
    url_name: str,
    output_dir: Path,
    html_hash: str,
    full_page: bool = True,
    tzname: str = "Europe/Rome",
    window_start: str = "00:02",
    window_end: str = "23:58",
    scheduler_api_url: Optional[str] = None,
) -> Optional[Path]:
    """
    Cattura lo screenshot per la pagina:
    - Crea la sottocartella output_dir / YYYY-MM-DD
    - Genera il file YYYY-MM-DD_name.png se manca (baseline)
    - Genera il file YYYY-MM-DD_HHMMSS_name_edit.png se il contenuto cambia (edit)
    - Invia una copia anche a Google Drive via drive_uploader
    """
    ensure_dir(output_dir)
    state_path = output_dir / "state.json"
    state = load_state(state_path)
    today = today_str(tzname)

    day_dir = output_dir / today
    ensure_dir(day_dir)

    key = f"{today}:{url_name}"
    baseline_name = f"{today}_{url_name}.png"
    baseline_path = day_dir / baseline_name
    prev_hash = state.get("last", {}).get(key)

    api_url = scheduler_api_url or os.environ.get("SCHEDULER_API_URL", "http://scala-scheduler:3000")

    # 1. Baseline mancante -> cattura
    if not baseline_path.exists():
        print(f"[shots] Baseline mancante per {key}, la creo in: {baseline_path}")
        image_bytes = take_screenshot(url, baseline_path, full_page=full_page, tzname=tzname)
        state.setdefault("last", {})[key] = html_hash
        save_state(state_path, state)

        if handle_screenshot:
            try:
                handle_screenshot(
                    image_bytes=image_bytes,
                    filename=f"{today}/{baseline_name}",
                    local_dest_dir=str(output_dir),
                    scheduler_api_url=api_url,
                )
            except Exception as e:
                print(f"[shots] Errore upload drive baseline: {e}")

        return baseline_path

    # 2. State non ha hash -> inizializza senza nuovo scatto
    if prev_hash is None:
        print(f"[shots] state.json senza hash per {key}, inizializzo.")
        state.setdefault("last", {})[key] = html_hash
        save_state(state_path, state)
        return None

    # 3. Hash cambiato -> scatto edit
    if prev_hash != html_hash:
        if _is_within_window(tzname, window_start, window_end):
            time_part = now_in_tz_str(tzname).split(" ")[1].replace(":", "")
            edit_name = f"{today}_{time_part}_{url_name}_edit.png"
            edit_path = day_dir / edit_name
            print(f"[shots] Contenuto cambiato per {key}, scatto edit: {edit_path}")
            image_bytes = take_screenshot(url, edit_path, full_page=full_page, tzname=tzname)
            
            if handle_screenshot:
                try:
                    handle_screenshot(
                        image_bytes=image_bytes,
                        filename=f"{today}/{edit_name}",
                        local_dest_dir=str(output_dir),
                        scheduler_api_url=api_url,
                    )
                except Exception as e:
                    print(f"[shots] Errore upload drive edit: {e}")
            
            state.setdefault("last", {})[key] = html_hash
            save_state(state_path, state)
            return edit_path
        else:
            print(f"[shots] Cambio rilevato per {key} ma fuori dalla finestra ({window_start}-{window_end}).")
            state.setdefault("last", {})[key] = html_hash
            save_state(state_path, state)

    return None
