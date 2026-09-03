import { google } from 'googleapis';
import { JWT, OAuth2Client } from 'google-auth-library';
import fs from 'fs/promises';
import { existsSync, readFileSync, createReadStream } from 'fs';
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

  // 1. Rileva in modo intelligente la cartella contenente gli screenshot locali
  const candidateShotDirs = [
    path.join(process.cwd(), 'public', 'odg_shots'),
    '/app/public/odg_shots',
    '/data/odg_shots',
    path.join(process.cwd(), 'odg_shots'),
    '/app/public',
    path.join(process.cwd(), 'public'),
    '/data',
  ];

  let shotsDir: string | null = null;
  let maxDateDirsFound = -1;

  for (const cand of candidateShotDirs) {
    if (existsSync(cand)) {
      try {
        const entries = await fs.readdir(cand, { withFileTypes: true });
        const dateDirs = entries.filter(
          (e) => e.isDirectory() && (/^\d{4}-\d{2}-\d{2}/.test(e.name) || /^\d{2}-\d{2}-\d{4}/.test(e.name))
        );
        if (dateDirs.length > maxDateDirsFound) {
          maxDateDirsFound = dateDirs.length;
          shotsDir = cand;
        }
      } catch (_) {}
    }
  }

  // Fallback al primo candidato esistente se nessun dateDirs trovato
  if (!shotsDir) {
    for (const cand of candidateShotDirs) {
      if (existsSync(cand)) {
        shotsDir = cand;
        break;
      }
    }
  }

  if (!shotsDir) {
    return { ok: true, totalFound: 0, uploaded: 0, skipped: 0, partial: false, errors: ['Nessuna cartella odg_shots trovata localmente.'] };
  }

  const auth = createDriveAuth();
  const drive = google.drive({ version: 'v3', auth });

  // Funzione normalizzazione data in formato standard ISO YYYY-MM-DD
  function normalizeDateFolderName(name: string): string {
    const mIT = name.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (mIT) return `${mIT[3]}-${mIT[2]}-${mIT[1]}`;
    return name;
  }

  // =========================================================================
  // FASE 1: CONFRONTO CARTELLE GIA' PRESENTI IN LOCALE E SU DRIVE
  // =========================================================================

  // 1a. Precarica tutte le cartelle già esistenti su Google Drive (singola query ultra-veloce)
  const driveFolderMap = new Map<string, string>(); // normalizedName -> folderId
  try {
    let pageToken: string | undefined = undefined;
    do {
      const listRes: any = await drive.files.list({
        q: `'${config.googleDriveFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'nextPageToken, files(id, name)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        pageSize: 1000,
        pageToken,
      });
      if (listRes.data && listRes.data.files) {
        for (const f of listRes.data.files) {
          if (f.name && f.id) {
            driveFolderMap.set(normalizeDateFolderName(f.name), f.id);
          }
        }
      }
      pageToken = listRes.data?.nextPageToken || undefined;
    } while (pageToken);
  } catch (e: any) {
    console.warn('[GoogleDrive] Errore caricamento cartelle Drive:', e.message);
  }

  // 1b. Legge tutte le cartelle presenti in locale
  const rawEntries = await fs.readdir(shotsDir, { withFileTypes: true });
  const localDirs = rawEntries.filter((e) => e.isDirectory());

  // Date di oggi e ieri
  const now = new Date();
  const todayISO = now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }); // "2026-09-03"
  const [tY, tM, tD] = todayISO.split('-');
  const todayIT = `${tD}-${tM}-${tY}`; // "03-09-2026"
  const yesterdayDate = new Date(Date.now() - 86400000);
  const yesterdayISO = yesterdayDate.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  const [yY, yM, yD] = yesterdayISO.split('-');
  const yesterdayIT = `${yD}-${yM}-${yY}`;

  function isDateToday(name: string): boolean {
    const norm = normalizeDateFolderName(name);
    return norm === todayISO || name === todayIT || name.startsWith(todayISO) || name.startsWith(todayIT);
  }

  function isDateYesterday(name: string): boolean {
    const norm = normalizeDateFolderName(name);
    return norm === yesterdayISO || name === yesterdayIT || name.startsWith(yesterdayISO) || name.startsWith(yesterdayIT);
  }

  // 1c. Confronto: separa cartelle MANCANTI da quelle GIA' PRESENTI su Drive
  const missingOnDriveDirs: typeof localDirs = [];
  const existingOnDriveDirs: typeof localDirs = [];

  for (const dir of localDirs) {
    const normName = normalizeDateFolderName(dir.name);
    if (driveFolderMap.has(normName)) {
      existingOnDriveDirs.push(dir);
    } else {
      missingOnDriveDirs.push(dir);
    }
  }

  // Ordina le mancanti mettendo prima oggi/ieri e poi le più recenti
  missingOnDriveDirs.sort((a, b) => {
    const pA = isDateToday(a.name) ? 0 : isDateYesterday(a.name) ? 1 : 2;
    const pB = isDateToday(b.name) ? 0 : isDateYesterday(b.name) ? 1 : 2;
    if (pA !== pB) return pA - pB;
    return b.name.localeCompare(a.name);
  });

  // =========================================================================
  // FASE 2: CREAZIONE CARTELLE MANCANTI E CARICAMENTO CONTENUTO
  // =========================================================================

  const errors: string[] = [];
  let uploadedCount = 0;
  let skippedCount = 0;
  let totalFound = 0;
  let partial = false;
  let todayNotice: string | undefined = undefined;
  const createdFolderNames: string[] = [];

  const startTime = Date.now();
  const MAX_SYNC_DURATION_MS = 24000;
  // Helper per caricare un singolo file su Drive tramite Stream nativo
  async function uploadFileToFolder(folderId: string, filePath: string, fileName: string): Promise<boolean> {
    const isPng = fileName.toLowerCase().endsWith('.png');
    const upRes: any = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType: isPng ? 'image/png' : 'image/jpeg',
        body: createReadStream(filePath),
      },
      fields: 'id, name',
      supportsAllDrives: true,
    });
    return !!upRes.data?.id;
  }

  // 2a. Crea le cartelle mancanti su Drive e carica i rispettivi file
  for (const dir of missingOnDriveDirs) {
    if (Date.now() - startTime > MAX_SYNC_DURATION_MS) {
      partial = true;
      break;
    }

    const normName = normalizeDateFolderName(dir.name);
    const subDirPath = path.join(shotsDir, dir.name);

    let filesInSub: string[] = [];
    try {
      filesInSub = await fs.readdir(subDirPath);
    } catch (_) {
      continue;
    }

    const imgFiles = filesInSub.filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
    totalFound += imgFiles.length;

    // Crea la cartella su Drive
    let targetFolderId: string;
    try {
      const createRes: any = await drive.files.create({
        requestBody: {
          name: normName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [config.googleDriveFolderId],
        },
        fields: 'id, name',
        supportsAllDrives: true,
      });
      targetFolderId = createRes.data?.id || config.googleDriveFolderId;
      driveFolderMap.set(normName, targetFolderId);
      createdFolderNames.push(normName);
    } catch (fErr: any) {
      errors.push(`Creazione cartella ${normName}: ${fErr.message}`);
      continue;
    }

    // Se la cartella di oggi è vuota, avvisa l'utente
    if (imgFiles.length === 0 && isDateToday(dir.name)) {
      todayNotice = `Cartella ${normName} creata su Drive, ma in locale non contiene ancora file immagine (.png). Usa "Esegui Scraper Adesso" per generare gli screenshot di oggi.`;
    }

    // Carica tutti i file immagine della nuova cartella
    for (const file of imgFiles) {
      if (Date.now() - startTime > MAX_SYNC_DURATION_MS) {
        partial = true;
        break;
      }
      try {
        const ok = await uploadFileToFolder(targetFolderId, path.join(subDirPath, file), file);
        if (ok) uploadedCount++;
      } catch (upErr: any) {
        errors.push(`${normName}/${file}: ${upErr.message}`);
      }
    }
  }

  // 2b. Verifica specifica per la cartella di OGGI (anche se esisteva già su Drive)
  // in modo da sincronizzare eventuali nuovi screenshot scattati in giornata
  const todayExistingDir = existingOnDriveDirs.find((d) => isDateToday(d.name));
  if (todayExistingDir && !partial) {
    const normToday = normalizeDateFolderName(todayExistingDir.name);
    const targetFolderId = driveFolderMap.get(normToday)!;
    const subDirPath = path.join(shotsDir, todayExistingDir.name);

    try {
      const filesInSub = await fs.readdir(subDirPath);
      const imgFiles = filesInSub.filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
      totalFound += imgFiles.length;

      // Legge i file già presenti nella cartella di oggi su Drive
      const listTodayRes: any = await drive.files.list({
        q: `'${targetFolderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
        fields: 'files(id, name)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      const driveFilesSet = new Set<string>((listTodayRes.data?.files || []).map((f: any) => f.name));

      for (const file of imgFiles) {
        if (driveFilesSet.has(file)) {
          skippedCount++;
        } else {
          try {
            const ok = await uploadFileToFolder(targetFolderId, path.join(subDirPath, file), file);
            if (ok) {
              uploadedCount++;
              driveFilesSet.add(file);
            }
          } catch (upErr: any) {
            errors.push(`${normToday}/${file}: ${upErr.message}`);
          }
        }
      }
    } catch (_) {}
  }

  // 2c. Per tutte le altre cartelle storiche già presenti su Drive:
  // Skip immediato a costo 0 millisecondi (nessuna chiamata di rete necessaria!)
  for (const dir of existingOnDriveDirs) {
    if (isDateToday(dir.name)) continue; // già gestita sopra
    try {
      const subDirPath = path.join(shotsDir, dir.name);
      const files = await fs.readdir(subDirPath);
      const imgCount = files.filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).length;
      totalFound += imgCount;
      skippedCount += imgCount;
    } catch (_) {}
  }

  const processedDetails = createdFolderNames.length > 0
    ? `Cartelle create su Drive: ${createdFolderNames.join(', ')} (totale locali: ${localDirs.length}, su Drive: ${driveFolderMap.size})`
    : `Tutte le cartelle locali (${localDirs.length}) sono già allineate su Google Drive (${driveFolderMap.size} cartelle presenti). Percorso: ${shotsDir}`;

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
