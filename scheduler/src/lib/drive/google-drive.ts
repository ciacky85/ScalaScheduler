import { google } from 'googleapis';
import { JWT, OAuth2Client } from 'google-auth-library';
import fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

export interface DriveConfig {
  googleDriveFolderUrl: string;
  googleDriveFolderId: string;
  salvaAncheInLocale: boolean;
  oauthClientId?: string;
  oauthClientSecret?: string;
  oauthRefreshToken?: string;
}

function getCandidateDriveConfigPaths(): string[] {
  return [
    path.join(process.cwd(), 'src', 'app', 'config', 'drive_config.json'),
    path.join(process.cwd(), 'config', 'drive_config.json'),
    '/app/config/drive_config.json',
    '/app/src/app/config/drive_config.json',
  ];
}

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

  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) {
    return trimmed;
  }

  return trimmed;
}

export function getDriveConfig(): DriveConfig {
  for (const cp of getCandidateDriveConfigPaths()) {
    try {
      if (existsSync(cp)) {
        const content = readFileSync(cp, 'utf-8');
        const parsed = JSON.parse(content);
        return {
          googleDriveFolderUrl: parsed.googleDriveFolderUrl || '',
          googleDriveFolderId: parsed.googleDriveFolderId || extractDriveFolderId(parsed.googleDriveFolderUrl),
          salvaAncheInLocale: parsed.salvaAncheInLocale !== undefined ? parsed.salvaAncheInLocale : true,
          oauthClientId: parsed.oauthClientId,
          oauthClientSecret: parsed.oauthClientSecret,
          oauthRefreshToken: parsed.oauthRefreshToken,
        };
      }
    } catch (error) {
      console.error(`Errore lettura drive config (${cp}):`, error);
    }
  }

  return {
    googleDriveFolderUrl: '',
    googleDriveFolderId: '',
    salvaAncheInLocale: true,
  };
}

/**
 * Crea il client di autenticazione per Google Drive:
 * 1. Priorità a OAuth 2.0 (User Token): agisce a nome dell'utente con quota personale
 * 2. Fallback a Service Account (JWT)
 */
export function createDriveAuth(): OAuth2Client | JWT {
  const config = getDriveConfig();

  if (config.oauthClientId && config.oauthClientSecret && config.oauthRefreshToken) {
    const oauth2Client = new OAuth2Client(config.oauthClientId, config.oauthClientSecret);
    oauth2Client.setCredentials({ refresh_token: config.oauthRefreshToken });
    return oauth2Client;
  }

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

export async function saveDriveConfig(config: Partial<DriveConfig>): Promise<DriveConfig> {
  const current = getDriveConfig();
  const folderUrl = config.googleDriveFolderUrl !== undefined ? config.googleDriveFolderUrl : current.googleDriveFolderUrl;
  const folderId = extractDriveFolderId(folderUrl);
  const salvaAncheInLocale = config.salvaAncheInLocale !== undefined ? config.salvaAncheInLocale : current.salvaAncheInLocale;

  const updated: DriveConfig = {
    googleDriveFolderUrl: folderUrl,
    googleDriveFolderId: folderId,
    salvaAncheInLocale: salvaAncheInLocale,
    oauthClientId: config.oauthClientId !== undefined ? config.oauthClientId : current.oauthClientId,
    oauthClientSecret: config.oauthClientSecret !== undefined ? config.oauthClientSecret : current.oauthClientSecret,
    oauthRefreshToken: config.oauthRefreshToken !== undefined ? config.oauthRefreshToken : current.oauthRefreshToken,
  };

  const primaryPaths = [
    path.join(process.cwd(), 'src', 'app', 'config', 'drive_config.json'),
    path.join(process.cwd(), 'config', 'drive_config.json'),
  ];

  for (const p of primaryPaths) {
    try {
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, JSON.stringify(updated, null, 2), 'utf-8');
    } catch (_) {}
  }

  try {
    if (existsSync('/app/config')) {
      await fs.writeFile('/app/config/drive_config.json', JSON.stringify(updated, null, 2), 'utf-8');
    }
  } catch (_) {}

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
      includeItemsFromAllDrives: true,
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
    const errorMsg = error?.response?.data?.error?.message || error?.message || 'Errore di connessione a Google Drive.';
    return { ok: false, error: `Errore Google Drive: ${errorMsg}` };
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

    // Gestione automatica sottocartella giornaliera (es. 2026-09-03)
    let targetFolderId = folderId;
    let finalFileName = fileName;

    const parts = fileName.replace(/\\/g, '/').split('/');
    if (parts.length > 1) {
      const subfolderName = parts[0];
      finalFileName = parts.slice(1).join('_');

      try {
        const q = `'${folderId}' in parents and name = '${subfolderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        const listRes = await drive.files.list({
          q,
          fields: 'files(id, name)',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });

        if (listRes.data.files && listRes.data.files.length > 0) {
          targetFolderId = listRes.data.files[0].id!;
        } else {
          const createFolderRes = await drive.files.create({
            requestBody: {
              name: subfolderName,
              mimeType: 'application/vnd.google-apps.folder',
              parents: [folderId],
            },
            fields: 'id, name',
            supportsAllDrives: true,
          });
          if (createFolderRes.data.id) {
            targetFolderId = createFolderRes.data.id;
          }
        }
      } catch (subErr) {
        console.warn('[GoogleDrive] Impossibile gestire sottocartella data, uso cartella principale:', subErr);
      }
    }

    const { Readable } = await import('stream');
    const stream = new Readable();
    stream.push(fileBuffer);
    stream.push(null);

    const response = await drive.files.create({
      requestBody: {
        name: finalFileName,
        parents: [targetFolderId],
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
    const rawMsg = error?.response?.data?.error?.message || error.message || 'Errore durante il caricamento su Google Drive.';
    if (rawMsg.includes('Service Accounts do not have storage quota')) {
      return {
        ok: false,
        error: 'Google Drive Error (403): I Service Account di Google non possiedono quota di archiviazione per caricare file in cartelle personali (@gmail.com). Configura OAuth 2.0 per caricare con il tuo account utente.',
      };
    }
    return { ok: false, error: rawMsg };
  }
}
