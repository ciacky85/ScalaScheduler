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

const ENV_OAUTH_CLIENT_ID = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID || '';
const ENV_OAUTH_CLIENT_SECRET = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET || '';
const ENV_OAUTH_REFRESH_TOKEN = process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN || '';
const DEFAULT_DRIVE_FOLDER_ID = '1mqmjTTtz5-c0Fa8hDOfkx6ph1tWKCCs_';

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
  let fileConfig: Partial<DriveConfig> = {};
  for (const cp of getCandidateDriveConfigPaths()) {
    try {
      if (existsSync(cp)) {
        const content = readFileSync(cp, 'utf-8');
        fileConfig = JSON.parse(content);
        break;
      }
    } catch (error) {
      console.error(`Errore lettura drive config (${cp}):`, error);
    }
  }

  const folderUrl = fileConfig.googleDriveFolderUrl || `https://drive.google.com/drive/folders/${DEFAULT_DRIVE_FOLDER_ID}`;
  const folderId = fileConfig.googleDriveFolderId || extractDriveFolderId(folderUrl) || DEFAULT_DRIVE_FOLDER_ID;

  return {
    googleDriveFolderUrl: folderUrl,
    googleDriveFolderId: folderId,
    salvaAncheInLocale: fileConfig.salvaAncheInLocale !== undefined ? fileConfig.salvaAncheInLocale : true,
    oauthClientId: fileConfig.oauthClientId || ENV_OAUTH_CLIENT_ID,
    oauthClientSecret: fileConfig.oauthClientSecret || ENV_OAUTH_CLIENT_SECRET,
    oauthRefreshToken: fileConfig.oauthRefreshToken || ENV_OAUTH_REFRESH_TOKEN,
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

  const extraPaths = [
    '/data/drive_config.json',
    '/app/public/drive_config.json',
    path.join(process.cwd(), 'public', 'drive_config.json'),
  ];
  for (const ep of extraPaths) {
    try {
      if (existsSync(path.dirname(ep))) {
        await fs.writeFile(ep, JSON.stringify(updated, null, 2), 'utf-8');
      }
    } catch (_) {}
  }

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

    const file: any = response.data;
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

/**
 * Sincronizza tutti gli screenshot locali presenti in public/odg_shots (o /data/odg_shots) su Google Drive.
 * Ottimizzato per:
 * 1. Cache immediata di tutte le cartelle su Google Drive in una sola query.
 * 2. Ordinamento decrescente (Newest First): date correnti e recenti sincronizzate per prime.
 * 3. Skip immediato dei file già caricati su Drive (verifica in memoria).
 * 4. Time-budget safety guard (25s) per prevenire categoricamente timeout 504 del reverse proxy.
 */
export async function syncLocalShotsToDrive(): Promise<{
  ok: boolean;
  totalFound: number;
  uploaded: number;
  skipped: number;
  partial: boolean;
  errors: string[];
  notice?: string;
  processedDetails?: string;
}> {
  const config = getDriveConfig();
  if (!config.googleDriveFolderId) {
    return { ok: false, totalFound: 0, uploaded: 0, skipped: 0, partial: false, errors: ['Nessuna cartella Google Drive configurata.'] };
  }

  const candidateShotDirs = [
    path.join(process.cwd(), 'public', 'odg_shots'),
    '/app/public/odg_shots',
    '/data/odg_shots',
    path.join(process.cwd(), 'odg_shots'),
  ];

  let shotsDir: string | null = null;
  for (const d of candidateShotDirs) {
    if (existsSync(d)) {
      shotsDir = d;
      break;
    }
  }

  if (!shotsDir) {
    return { ok: true, totalFound: 0, uploaded: 0, skipped: 0, partial: false, errors: ['Nessuna cartella odg_shots trovata localmente.'] };
  }

  const auth = createDriveAuth();
  const drive = google.drive({ version: 'v3', auth });

  // 1. Precarica in memoria tutte le cartelle Drive già esistenti per evitare decine di chiamate ripetute
  const folderMap = new Map<string, string>(); // subfolderName -> subfolderId
  try {
    let pageToken: string | undefined = undefined;
    do {
      const listRes: any = await drive.files.list({
        q: `'${config.googleDriveFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'nextPageToken, files(id, name)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        pageToken,
      });
      if (listRes.data && listRes.data.files) {
        for (const f of listRes.data.files) {
          if (f.name && f.id) folderMap.set(f.name, f.id);
        }
      }
      pageToken = listRes.data?.nextPageToken || undefined;
    } while (pageToken);
  } catch (e: any) {
    console.warn('[GoogleDrive] Errore pre-fetching cartelle Drive:', e.message);
  }

  function normalizeDriveFolderName(name: string): string {
    const mIT = name.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (mIT) return `${mIT[3]}-${mIT[2]}-${mIT[1]}`;
    return name;
  }

  async function getOrCreateDriveSubfolder(subName: string): Promise<string> {
    const normName = normalizeDriveFolderName(subName);
    if (folderMap.has(normName)) {
      return folderMap.get(normName)!;
    }
    const createFolderRes: any = await drive.files.create({
      requestBody: {
        name: normName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [config.googleDriveFolderId],
      },
      fields: 'id, name',
      supportsAllDrives: true,
    });
    const newId = createFolderRes.data?.id || config.googleDriveFolderId;
    folderMap.set(normName, newId);
    return newId;
  }

  // Cache dei file già presenti in ciascuna cartella Google Drive per non ri-caricarli
  const folderFilesCache = new Map<string, Set<string>>(); // targetFolderId -> Set di nomi file già su Drive

  async function getFilesAlreadyInDriveFolder(targetFolderId: string): Promise<Set<string>> {
    if (folderFilesCache.has(targetFolderId)) {
      return folderFilesCache.get(targetFolderId)!;
    }
    const set = new Set<string>();
    try {
      let pageToken: string | undefined = undefined;
      do {
        const listFilesRes: any = await drive.files.list({
          q: `'${targetFolderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
          fields: 'nextPageToken, files(id, name)',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
          pageToken,
        });
        if (listFilesRes.data && listFilesRes.data.files) {
          for (const f of listFilesRes.data.files) {
            if (f.name) set.add(f.name);
          }
        }
        pageToken = listFilesRes.data?.nextPageToken || undefined;
      } while (pageToken);
    } catch (err: any) {
      console.warn(`[GoogleDrive] Errore cache file per cartella ${targetFolderId}:`, err.message);
    }
    folderFilesCache.set(targetFolderId, set);
    return set;
  }

  const errors: string[] = [];
  let uploadedCount = 0;
  let skippedCount = 0;
  let totalFound = 0;
  let partial = false;
  let todayNotice: string | undefined = undefined;

  const startTime = Date.now();
  let dirEntries: any[] = [];
  let checkedDirs: string[] = [];
  try {
    const rawEntries = await fs.readdir(shotsDir, { withFileTypes: true });

    // Calcolo date odierne e recenti per priorità assoluta
    const now = new Date();
    const todayISO = now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }); // "2026-09-03"
    const [tY, tM, tD] = todayISO.split('-');
    const todayIT = `${tD}-${tM}-${tY}`; // "03-09-2026"
    const yesterdayDate = new Date(Date.now() - 86400000);
    const yesterdayISO = yesterdayDate.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
    const [yY, yM, yD] = yesterdayISO.split('-');
    const yesterdayIT = `${yD}-${yM}-${yY}`;

    function getDirPriority(name: string): number {
      if (name === todayISO || name === todayIT || name.startsWith(todayISO) || name.startsWith(todayIT)) return 0;
      if (name === yesterdayISO || name === yesterdayIT || name.startsWith(yesterdayISO) || name.startsWith(yesterdayIT)) return 1;
      return 2;
    }

    // Ordina mettendo OGGI al primissimo posto (priorità 0), IERI (priorità 1), poi le altre decrescenti
    dirEntries = rawEntries
      .filter((e) => e.isDirectory())
      .sort((a, b) => {
        const pA = getDirPriority(a.name);
        const pB = getDirPriority(b.name);
        if (pA !== pB) return pA - pB;
        return b.name.localeCompare(a.name);
      });

    const rootFiles = rawEntries
      .filter((e) => e.isFile() && /\.(png|jpe?g|webp)$/i.test(e.name))
      .sort((a, b) => b.name.localeCompare(a.name));

    const { Readable } = await import('stream');

    // 1. Processa le sottocartelle data (oggi e ieri per prime in assoluto!)
    let checkedDirsCount = 0;
    for (const dirEntry of dirEntries) {
      if (Date.now() - startTime > MAX_SYNC_DURATION_MS) {
        partial = true;
        break;
      }

      checkedDirsCount++;
      checkedDirs.push(dirEntry.name);
      const subDirPath = path.join(shotsDir, dirEntry.name);
      let filesInSub: string[] = [];
      try {
        filesInSub = await fs.readdir(subDirPath);
      } catch (_) {
        continue;
      }

      const imgFiles = filesInSub
        .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
        .sort((a, b) => b.localeCompare(a));

      const isTodayOrYesterday = getDirPriority(dirEntry.name) <= 1;

      // Se la cartella di oggi in locale non ha screenshot, registriamo la nota per l'utente
      if (imgFiles.length === 0) {
        if (getDirPriority(dirEntry.name) === 0) {
          todayNotice = `La cartella locale di oggi (${dirEntry.name}) non contiene file immagine (.png). Clicca su "Esegui Scraper Adesso" per generare gli screenshot di oggi.`;
        }
        continue;
      }

      totalFound += imgFiles.length;

      const normName = normalizeDriveFolderName(dirEntry.name);

      // OTTIMIZZAZIONE ARCHIVIO STORICO:
      // Se la cartella è vecchia (non oggi né ieri) ed esiste già su Google Drive,
      // sappiamo che è già sincronizzata dall'archivio: saltiamo la query file-by-file per completare in 1 secondo!
      if (!isTodayOrYesterday && folderMap.has(normName) && checkedDirsCount > 5) {
        skippedCount += imgFiles.length;
        continue;
      }

      // Ottieni o crea la cartella su Drive
      let targetFolderId = config.googleDriveFolderId;
      try {
        targetFolderId = await getOrCreateDriveSubfolder(dirEntry.name);
      } catch (fErr: any) {
        errors.push(`Cartella ${dirEntry.name}: ${fErr.message}`);
        continue;
      }

      // Se la cartella su Drive è stata appena creata, sappiamo che è vuota senza fare chiamate
      let existingInDrive = new Set<string>();
      if (folderMap.has(normName)) {
        existingInDrive = await getFilesAlreadyInDriveFolder(targetFolderId);
      } else {
        folderFilesCache.set(targetFolderId, existingInDrive);
      }

      for (const file of imgFiles) {
        if (Date.now() - startTime > MAX_SYNC_DURATION_MS) {
          partial = true;
          break;
        }

        const finalDriveName = file;

        if (existingInDrive.has(finalDriveName)) {
          skippedCount++;
          continue; // File già presente su Drive: skip istantaneo!
        }

        const fullFilePath = path.join(subDirPath, file);
        try {
          const buffer = await fs.readFile(fullFilePath);
          const stream = new Readable();
          stream.push(buffer);
          stream.push(null);

          const upRes: any = await drive.files.create({
            requestBody: {
              name: finalDriveName,
              parents: [targetFolderId],
            },
            media: {
              mimeType: file.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
              body: stream,
            },
            fields: 'id, name',
            supportsAllDrives: true,
          });

          if (upRes.data?.id) {
            uploadedCount++;
            existingInDrive.add(finalDriveName);
          } else {
            errors.push(`${dirEntry.name}/${file}: Mancato ID file Drive`);
          }
        } catch (upErr: any) {
          const msg = upErr?.response?.data?.error?.message || upErr.message;
          errors.push(`${dirEntry.name}/${file}: ${msg}`);
        }
      }
    }

    // 2. Eventuali file immagine nella root di odg_shots
    if (!partial && rootFiles.length > 0) {
      totalFound += rootFiles.length;
      const rootExisting = await getFilesAlreadyInDriveFolder(config.googleDriveFolderId);

      for (const rf of rootFiles) {
        if (Date.now() - startTime > MAX_SYNC_DURATION_MS) {
          partial = true;
          break;
        }

        if (rootExisting.has(rf.name)) {
          skippedCount++;
          continue;
        }

        const fullPath = path.join(shotsDir, rf.name);
        try {
          const buffer = await fs.readFile(fullPath);
          const stream = new Readable();
          stream.push(buffer);
          stream.push(null);

          const upRes: any = await drive.files.create({
            requestBody: {
              name: rf.name,
              parents: [config.googleDriveFolderId],
            },
            media: {
              mimeType: rf.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
              body: stream,
            },
            fields: 'id, name',
            supportsAllDrives: true,
          });

          if (upRes.data?.id) {
            uploadedCount++;
            rootExisting.add(rf.name);
          }
        } catch (upErr: any) {
          const msg = upErr?.response?.data?.error?.message || upErr.message;
          errors.push(`${rf.name}: ${msg}`);
        }
      }
    }
  } catch (err: any) {
    return { ok: false, totalFound, uploaded: uploadedCount, skipped: skippedCount, partial, errors: [err.message] };
  }

  const processedDetails = `Cartelle analizzate (${checkedDirs.length}): ${checkedDirs.slice(0, 4).join(', ')}`;

  return {
    ok: errors.length === 0,
    totalFound,
    uploaded: uploadedCount,
    skipped: skippedCount,
    partial,
    errors,
    notice: todayNotice,
    processedDetails,
  };
}
