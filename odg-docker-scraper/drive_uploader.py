import os
import json
import re
import requests
from pathlib import Path

CONFIG_PATH = os.environ.get("DRIVE_CONFIG_PATH", "/data/drive_config.json")
SERVICE_ACCOUNT_KEY_PATH = os.environ.get("SERVICE_ACCOUNT_KEY_PATH", "/data/service-account-key.json")

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
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                defaults.update(data)
                if not defaults.get("googleDriveFolderId") and defaults.get("googleDriveFolderUrl"):
                    defaults["googleDriveFolderId"] = extract_drive_folder_id(defaults["googleDriveFolderUrl"])
        except Exception as e:
            print(f"[DriveUploader] Errore lettura config: {e}")
    return defaults

def handle_screenshot(image_bytes: bytes, filename: str, local_dest_dir: str = "/data/odg_shots", scheduler_api_url: str = "http://localhost:3000"):
    """
    Gestisce il salvataggio dello screenshot:
    - Se 'salvaAncheInLocale' è True: salva localmente in local_dest_dir
    - Invia lo screenshot alla webapp scheduler per il caricamento su Google Drive
    """
    cfg = load_drive_config()
    salva_locale = cfg.get("salvaAncheInLocale", True)
    
    # 1. Salvataggio locale
    if salva_locale:
        os.makedirs(local_dest_dir, exist_ok=True)
        local_path = os.path.join(local_dest_dir, filename)
        with open(local_path, "wb") as f:
            f.write(image_bytes)
        print(f"[DriveUploader] Screenshot salvato in locale: {local_path}")
    else:
        print("[DriveUploader] Salvataggio locale disattivato da configurazione.")

    # 2. Upload tramite API Next.js / Google Drive
    try:
        api_endpoint = f"{scheduler_api_url.rstrip('/')}/api/screenshots/upload"
        files = {"file": (filename, image_bytes, "image/png")}
        data = {"filename": filename}
        resp = requests.post(api_endpoint, files=files, data=data, timeout=30)
        if resp.ok:
            res_json = resp.json()
            print(f"[DriveUploader] Risultato upload Drive: {res_json.get('driveResult')}")
            return res_json
        else:
            print(f"[DriveUploader] Errore chiamata API upload ({resp.status_code}): {resp.text}")
    except Exception as e:
        print(f"[DriveUploader] Impossibile contattare l'endpoint scheduler per l'upload Drive: {e}")

    return None
