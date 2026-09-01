import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

export interface DriveConfig {
  googleDriveFolderUrl: string;
  googleDriveFolderId: string;
  salvaAncheInLocale: boolean;
}

const DRIVE_CONFIG_PATH = path.join(process.cwd(), 'src', 'app', 'config', 'drive_config.json');

export function getServiceAccount(): { client_email?: string; private_key?: string } {
  const candidates = [
    path.join(process.cwd(), 'src', 'app', 'config', 'service-account-key.json'),
    path.join(process.cwd(), 'config', 'service-account-key.json'),
    '/app/config/service-account-key.json',
    '/app/src/app/config/service-account-key.json',
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, 'utf-8'));
      } catch (_) {}
    }
  }
  return {};
}

/**
 * Estrae l'ID della cartella Google Drive da un link o accetta direttamente l'ID.
 * Esempi supportati:
 * - https://drive.google.com/drive/folders/1aBcD_efGhIjKlMnOpQrStUvWxYz
 * - https://drive.google.com/drive/u/0/folders/1aBcD_efGhIjKlMnOpQrStUvWxYz
 * - https://drive.google.com/open?id=1aBcD_efGhIjKlMnOpQrStUvWxYz
 * - 1aBcD_efGhIjKlMnOpQrStUvWxYz
 */
export function extractDriveFolderId(urlOrId: string | null | undefined): string {
  if (!urlOrId) return '';
  const trimmed = urlOrId.trim();

  // Pattern /folders/ID
  const matchFolders = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (matchFolders && matchFolders[1]) {
    return matchFolders[1];
  }

  // Pattern id=ID
  const matchId = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchId && matchId[1]) {
    return matchId[1];
  }

  // Se è un ID pulito (stringa alfanumerica con trattini/underscore)
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) {
    return trimmed;
  }

  return trimmed;
}

export function createDriveAuth(): JWT {
  const sa = getServiceAccount();
  return new JWT({
    email: sa.client_email || '',
    key: sa.private_key || '',
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file',
    ],
  });
}

export function getDriveConfig(): DriveConfig {
  try {
    if (existsSync(DRIVE_CONFIG_PATH)) {
      const content = readFileSync(DRIVE_CONFIG_PATH, 'utf-8');
      const parsed = JSON.parse(content);
      return {
        googleDriveFolderUrl: parsed.googleDriveFolderUrl || '',
        googleDriveFolderId: parsed.googleDriveFolderId || extractDriveFolderId(parsed.googleDriveFolderUrl),
        salvaAncheInLocale: parsed.salvaAncheInLocale !== undefined ? parsed.salvaAncheInLocale : true,
      };
    }
  } catch (error) {
    console.error('Failed to read drive_config.json:', error);
  }

  return {
    googleDriveFolderUrl: '',
    googleDriveFolderId: '',
    salvaAncheInLocale: true,
  };
}

export async function saveDriveConfig(config: Partial<DriveConfig>): Promise<DriveConfig> {
  const current = getDriveConfig();
  const folderUrl = config.googleDriveFolderUrl !== undefined ? config.googleDriveFolderUrl : current.googleDriveFolderUrl;
  const folderId = extractDriveFolderId(folderUrl);
  const salvaAncheInLocale = config.salvaAncheInLocale !== undefined ? config.salvaAncheInLocale : current.salvaAncheInLocale;

  const updated: DriveConfig = {
    googleDriveFolderUrl: folderUrl,
    googleDriveFolderId: folderId,
    salvaAncheInLocale: salvaAncheInLocale,
  };

  const dir = path.dirname(DRIVE_CONFIG_PATH);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(DRIVE_CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

export async function verifyDriveFolderAccess(folderId: string): Promise<{ ok: boolean; folderName?: string; error?: string }> {
  try {
    if (!folderId) {
      return { ok: false, error: 'ID cartella non specificato.' };
    }

    const auth = createDriveAuth();
    const drive = google.drive({ version: 'v3', auth });

    const response = await drive.files.get({
      fileId: folderId,
      fields: 'id, name, mimeType, capabilities',
      supportsAllDrives: true,
    });

    const file = response.data;
    if (file.mimeType !== 'application/vnd.google-apps.folder') {
      return { ok: false, error: `L'elemento indicato ("${file.name}") non è una cartella.` };
    }

    return {
      ok: true,
      folderName: file.name || 'Cartella Google Drive',
    };
  } catch (error: any) {
    const sa = getServiceAccount();
    const saEmail = sa.client_email || 'Service Account';
    const errorMsg = error?.response?.data?.error?.message || error.message || 'Errore di connessione a Google Drive.';
    if (error?.response?.status === 404) {
      return {
        ok: false,
        error: `Cartella non trovata (404). Verifica che il link sia corretto e che la cartella sia stata condivisa con l'account di servizio (${saEmail}) con permessi di Editor.`,
      };
    }
    if (error?.response?.status === 403) {
      return {
        ok: false,
        error: `Permesso negato (403). Assicurati che l'account di servizio (${saEmail}) sia stato aggiunto come Editor alla cartella.`,
      };
    }
    return { ok: false, error: errorMsg };
  }
}

export async function uploadScreenshotToDrive(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string = 'image/png',
  customFolderId?: string
): Promise<{ ok: boolean; fileId?: string; webViewLink?: string; error?: string }> {
  try {
    const config = getDriveConfig();
    const folderId = customFolderId || config.googleDriveFolderId;

    if (!folderId) {
      return { ok: false, error: 'Nessuna cartella Google Drive configurata per gli screenshot.' };
    }

    const auth = createDriveAuth();
    const drive = google.drive({ version: 'v3', auth });

    const { Readable } = await import('stream');
    const stream = new Readable();
    stream.push(fileBuffer);
    stream.push(null);

    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType: mimeType,
        body: stream,
      },
      fields: 'id, name, webViewLink',
      supportsAllDrives: true,
    });

    return {
      ok: true,
      fileId: response.data.id || undefined,
      webViewLink: response.data.webViewLink || undefined,
    };
  } catch (error: any) {
    const errorMsg = error?.response?.data?.error?.message || error.message || 'Errore durante il caricamento su Google Drive.';
    return { ok: false, error: errorMsg };
  }
}
