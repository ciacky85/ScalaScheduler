import os
import json
import re
import requests
from pathlib import Path

CONFIG_PATHS = [
    Path(os.environ.get("DRIVE_CONFIG_PATH", "/data/drive_config.json")),
    Path("/data/drive_config.json"),
    Path("/app/public/drive_config.json"),
    Path("/config/drive_config.json"),
    Path("drive_config.json"),
]
DEFAULT_SCHEDULER_URL = os.environ.get("SCHEDULER_API_URL", "http://scala-scheduler:3000")

def extract_drive_folder_id(url_or_id: str) -> str:
    if not url_or_id:
        return ""
    url_or_id = url_or_id.strip()
    m_folders = re.search(r"/folders/([a-zA-Z0-9_-]+)", url_or_id)
    if m_folders:
        return m_folders.group(1)
    m_id = re.search(r"[?&]id=([a-zA-Z0-9_-]+)", url_or_id)
    if m_id:
        return m_id.group(1)
    return url_or_id

def load_drive_config():
    defaults = {
        "googleDriveFolderUrl": "",
        "googleDriveFolderId": "",
        "salvaAncheInLocale": True
    }
    for p in CONFIG_PATHS:
        if p.exists():
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    defaults.update(data)
                    if not defaults.get("googleDriveFolderId") and defaults.get("googleDriveFolderUrl"):
                        defaults["googleDriveFolderId"] = extract_drive_folder_id(defaults["googleDriveFolderUrl"])
                    break
            except Exception as e:
                print(f"[DriveUploader] Errore lettura config ({p}): {e}")
    return defaults

def handle_screenshot(
    image_bytes: bytes,
    filename: str,
    local_dest_dir: str = "/data/odg_shots",
    scheduler_api_url: str = DEFAULT_SCHEDULER_URL
):
    """
    Gestisce il salvataggio dello screenshot:
    - Se 'salvaAncheInLocale' è True: salva localmente in local_dest_dir / filename
    - Invia lo screenshot alla webapp scheduler per il caricamento su Google Drive
    """
    cfg = load_drive_config()
    salva_locale = cfg.get("salvaAncheInLocale", True)
    
    # 1. Salvataggio locale (se non già scritto altrove)
    if salva_locale:
        local_path = os.path.join(local_dest_dir, filename)
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        if not os.path.exists(local_path):
            with open(local_path, "wb") as f:
                f.write(image_bytes)
            print(f"[DriveUploader] Screenshot salvato in locale: {local_path}")
    else:
        print("[DriveUploader] Salvataggio locale disattivato da configurazione.")

    # 2. Upload tramite API Next.js / Google Drive
    target_urls = [
        scheduler_api_url.rstrip("/"),
        "http://scala-scheduler:3000",
        "http://ScalaScheduler:3000",
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ]
    unique_urls = list(dict.fromkeys(target_urls))

    max_retries = 6
    for attempt in range(1, max_retries + 1):
        for base_url in unique_urls:
            try:
                api_endpoint = f"{base_url}/api/screenshots/upload"
                files = {"file": (os.path.basename(filename), image_bytes, "image/png")}
                data = {"filename": filename}
                resp = requests.post(api_endpoint, files=files, data=data, timeout=30)
                if resp.ok:
                    res_json = resp.json()
                    print(f"[DriveUploader] Risultato upload Drive ({base_url}): {res_json.get('driveResult')}")
                    return res_json
                else:
                    print(f"[DriveUploader] Endpoint {base_url} ha risposto con errore ({resp.status_code}): {resp.text}")
            except Exception:
                continue

        if attempt < max_retries:
            print(f"[DriveUploader] Scheduler non ancora pronto, attesa 5s (tentativo {attempt}/{max_retries})...")
            import time
            time.sleep(5)

    print("[DriveUploader] Impossibile contattare l'endpoint scheduler per l'upload Drive.")
    return None
