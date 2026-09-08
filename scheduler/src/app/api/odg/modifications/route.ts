import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import { existsSync, readdirSync, statSync } from 'fs';
import path from 'path';

export interface ModificationItem {
  id: string;
  timestamp: string;
  date: string;
  time: string;
  url_name: string;
  url?: string;
  type: 'baseline' | 'edit';
  filename: string;
  relative_path: string;
  drive_result?: {
    ok?: boolean;
    fileId?: string;
    webViewLink?: string;
  } | null;
  prev_hash?: string | null;
  new_hash?: string | null;
  note?: string;
}

function getCandidateModificationsPaths(): string[] {
  return [
    '/data/odg_shots/modifications.json',
    '/app/public/odg_shots/modifications.json',
    path.join(process.cwd(), 'public', 'odg_shots', 'modifications.json'),
    '/data/modifications.json',
    path.join(process.cwd(), 'odg_shots', 'modifications.json'),
  ];
}

function getCandidateShotsDirs(): string[] {
  return [
    '/data/odg_shots',
    '/app/public/odg_shots',
    path.join(process.cwd(), 'public', 'odg_shots'),
    path.join(process.cwd(), 'odg_shots'),
    '/data',
    path.join(process.cwd(), 'public'),
  ];
}

/**
 * Normalizza qualsiasi formato data in standard ISO YYYY-MM-DD
 * Supporta: YYYY-MM-DD, DD-MM-YYYY, YYYY_MM_DD, DD_MM_YYYY, YYYYMMDD
 */
function normalizeDateStr(raw: string): string | null {
  if (!raw) return null;
  const clean = raw.trim();

  // 1. ISO YYYY-MM-DD o YYYY_MM_DD o YYYY/MM/DD
  const mISO = clean.match(/^(\d{4})[/-_](\d{1,2})[/-_](\d{1,2})/);
  if (mISO) {
    const y = mISO[1];
    const m = mISO[2].padStart(2, '0');
    const d = mISO[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 2. IT DD-MM-YYYY o DD_MM_YYYY o DD/MM/YYYY
  const mIT = clean.match(/^(\d{1,2})[/-_](\d{1,2})[/-_](\d{4})/);
  if (mIT) {
    const d = mIT[1].padStart(2, '0');
    const m = mIT[2].padStart(2, '0');
    const y = mIT[3];
    return `${y}-${m}-${d}`;
  }

  // 3. Compatto YYYYMMDD
  const mCompact = clean.match(/^(\d{4})(\d{2})(\d{2})/);
  if (mCompact) {
    return `${mCompact[1]}-${mCompact[2]}-${mCompact[3]}`;
  }

  return null;
}

interface RawFileEntry {
  filename: string;
  relativePath: string;
  fullPath: string;
  date: string; // ISO YYYY-MM-DD
  mtime: Date;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filterDateRaw = searchParams.get('date'); // es. "2026-09-08"
    const filterDate = filterDateRaw ? normalizeDateStr(filterDateRaw) || filterDateRaw : null;

    let jsonItems: ModificationItem[] = [];

    // 1. Prova a caricare dal file JSON persistente modifications.json
    for (const p of getCandidateModificationsPaths()) {
      if (existsSync(p)) {
        try {
          const raw = await fs.readFile(p, 'utf-8');
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            jsonItems = parsed.map(it => {
              const norm = normalizeDateStr(it.date) || it.date;
              return { ...it, date: norm };
            });
            break;
          }
        } catch (e: any) {
          console.error(`[modifications-api] Errore lettura ${p}:`, e.message);
        }
      }
    }

    // Mappa veloce degli elementi già presenti in modifications.json per filename
    const jsonItemMap = new Map<string, ModificationItem>();
    for (const it of jsonItems) {
      if (it.filename) jsonItemMap.set(it.filename, it);
    }

    // 2. SCANSIONE APPROFONDITA DEL FILESYSTEM (TUTTE LE CARTELLE E DATE STORICHE)
    // Non filtriamo mai le cartelle in fase di scansione in modo da raccogliere lo storico completo
    const discoveredFilesByDate = new Map<string, RawFileEntry[]>();
    const seenRelativePaths = new Set<string>();

    for (const baseDir of getCandidateShotsDirs()) {
      if (!existsSync(baseDir)) continue;

      try {
        const entries = readdirSync(baseDir, { withFileTypes: true });

        for (const entry of entries) {
          // A. SOTTOCARTELLE
          if (entry.isDirectory()) {
            const dirName = entry.name;
            const normDay = normalizeDateStr(dirName);

            // Caso A1: Sottocartella corrispondente direttamente a un giorno (es: "2026-09-08" o "08-09-2026")
            if (normDay) {
              const fullDayDir = path.join(baseDir, dirName);
              try {
                const dayFiles = readdirSync(fullDayDir);
                for (const file of dayFiles) {
                  if (!file.toLowerCase().endsWith('.png')) continue;
                  const relPath = `${dirName}/${file}`;
                  if (seenRelativePaths.has(relPath)) continue;
                  seenRelativePaths.add(relPath);

                  const fullFilePath = path.join(fullDayDir, file);
                  let mtime = new Date();
                  try {
                    mtime = statSync(fullFilePath).mtime;
                  } catch (_) {}

                  const list = discoveredFilesByDate.get(normDay) || [];
                  list.push({
                    filename: file,
                    relativePath: relPath,
                    fullPath: fullFilePath,
                    date: normDay,
                    mtime,
                  });
                  discoveredFilesByDate.set(normDay, list);
                }
              } catch (_) {}
            } 
            // Caso A2: Sottocartella mensile (es: "2026-09" o "09-2026")
            else if (/^\d{4}-\d{2}$/.test(dirName) || /^\d{2}-\d{4}$/.test(dirName)) {
              const fullMonthDir = path.join(baseDir, dirName);
              try {
                const subEntries = readdirSync(fullMonthDir, { withFileTypes: true });
                for (const sub of subEntries) {
                  if (sub.isDirectory()) {
                    let subNormDay = normalizeDateStr(sub.name);
                    if (!subNormDay && /^\d{1,2}$/.test(sub.name)) {
                      // Giorno numerico (es: "08") all'interno della cartella mese (es: "2026-09")
                      subNormDay = normalizeDateStr(`${dirName}-${sub.name}`);
                    }
                    if (subNormDay) {
                      const dayPath = path.join(fullMonthDir, sub.name);
                      const files = readdirSync(dayPath);
                      for (const file of files) {
                        if (!file.toLowerCase().endsWith('.png')) continue;
                        const relPath = `${dirName}/${sub.name}/${file}`;
                        if (seenRelativePaths.has(relPath)) continue;
                        seenRelativePaths.add(relPath);

                        const fullFilePath = path.join(dayPath, file);
                        let mtime = new Date();
                        try {
                          mtime = statSync(fullFilePath).mtime;
                        } catch (_) {}

                        const list = discoveredFilesByDate.get(subNormDay) || [];
                        list.push({
                          filename: file,
                          relativePath: relPath,
                          fullPath: fullFilePath,
                          date: subNormDay,
                          mtime,
                        });
                        discoveredFilesByDate.set(subNormDay, list);
                      }
                    }
                  } else if (sub.isFile() && sub.name.toLowerCase().endsWith('.png')) {
                    // File png direttamente nella cartella mensile
                    const fileDate = normalizeDateStr(sub.name) || normalizeDateStr(dirName);
                    if (fileDate) {
                      const relPath = `${dirName}/${sub.name}`;
                      if (!seenRelativePaths.has(relPath)) {
                        seenRelativePaths.add(relPath);
                        const fullFilePath = path.join(fullMonthDir, sub.name);
                        let mtime = new Date();
                        try {
                          mtime = statSync(fullFilePath).mtime;
                        } catch (_) {}

                        const list = discoveredFilesByDate.get(fileDate) || [];
                        list.push({
                          filename: sub.name,
                          relativePath: relPath,
                          fullPath: fullFilePath,
                          date: fileDate,
                          mtime,
                        });
                        discoveredFilesByDate.set(fileDate, list);
                      }
                    }
                  }
                }
              } catch (_) {}
            }
          } 
          // B. FILE PNG DIRETTAMENTE NELLA DIRECTORY BASE
          else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) {
            const fileDate = normalizeDateStr(entry.name);
            if (fileDate) {
              const relPath = entry.name;
              if (!seenRelativePaths.has(relPath)) {
                seenRelativePaths.add(relPath);
                const fullFilePath = path.join(baseDir, entry.name);
                let mtime = new Date();
                try {
                  mtime = statSync(fullFilePath).mtime;
                } catch (_) {}

                const list = discoveredFilesByDate.get(fileDate) || [];
                list.push({
                  filename: entry.name,
                  relativePath: relPath,
                  fullPath: fullFilePath,
                  date: fileDate,
                  mtime,
                });
                discoveredFilesByDate.set(fileDate, list);
              }
            }
          }
        }
      } catch (err: any) {
        console.error(`[modifications-api] Errore scansione baseDir ${baseDir}:`, err.message);
      }
    }

    // 3. COSTRUZIONE E CLASSIFICAZIONE DI TUTTI GLI ELEMENTI STORICI
    const allItems: ModificationItem[] = [];
    const datesSummary: Record<string, { total: number; editsCount: number; baselinesCount: number; hasEdits: boolean }> = {};

    // Prima indicizziamo tutte le date scoperte sul filesystem
    for (const [dateStr, files] of discoveredFilesByDate.entries()) {
      // Ordina i file della giornata cronologicamente per mtime o nome
      files.sort((a, b) => {
        const diff = a.mtime.getTime() - b.mtime.getTime();
        if (diff !== 0) return diff;
        return a.filename.localeCompare(b.filename);
      });

      const totalFiles = files.length;
      const hasExplicitEdit = files.some(f => f.filename.toLowerCase().includes('edit'));
      // Regola: se ci sono 3 o più screenshot per la giornata, o se uno contiene "edit", la giornata presenta modifiche
      const dayHasEdits = hasExplicitEdit || totalFiles >= 3;

      let editsCount = 0;
      let baselinesCount = 0;

      for (let idx = 0; idx < files.length; idx++) {
        const fileEntry = files[idx];
        const { filename, relativePath, mtime } = fileEntry;

        // Se l'elemento esiste già in modifications.json, manteniamo le sue informazioni arricchite
        const existingJson = jsonItemMap.get(filename);

        // Classificazione:
        // 1. Se il nome contiene "edit", è una modifica
        // 2. Altrimenti se totalFiles >= 3:
        //    - I primi 2 file (index 0 e 1, baseline dei 2 URL di routine odg_0 e odg_1) sono baseline
        //    - I file dal 3° in poi (index >= 2) sono modifiche intervenute durante la giornata
        // 3. Altrimenti è baseline
        let isEdit = false;
        if (filename.toLowerCase().includes('edit')) {
          isEdit = true;
        } else if (totalFiles >= 3 && idx >= 2) {
          isEdit = true;
        }

        if (existingJson && existingJson.type) {
          isEdit = existingJson.type === 'edit';
        }

        if (isEdit) {
          editsCount++;
        } else {
          baselinesCount++;
        }

        // Estrai url_name
        let urlName = 'odg_0';
        if (filename.includes('odg_1')) urlName = 'odg_1';
        else if (filename.includes('odg_0')) urlName = 'odg_0';

        const timeFormatted = mtime.toLocaleTimeString('it-IT', { hour12: false });

        const item: ModificationItem = {
          id: existingJson?.id || `disc_${dateStr}_${filename}`,
          timestamp: existingJson?.timestamp || mtime.toISOString(),
          date: dateStr,
          time: existingJson?.time || timeFormatted,
          url_name: existingJson?.url_name || urlName,
          url: existingJson?.url,
          type: isEdit ? 'edit' : 'baseline',
          filename: filename,
          relative_path: relativePath,
          drive_result: existingJson?.drive_result,
          prev_hash: existingJson?.prev_hash,
          new_hash: existingJson?.new_hash,
          note: existingJson?.note || (isEdit 
            ? (filename.toLowerCase().includes('edit') 
                ? 'Screenshot di modifica registrata' 
                : `Screenshot aggiuntivo di variazione (scatto n. ${idx + 1} del giorno)`)
            : 'Screenshot baseline iniziale del giorno'),
        };

        allItems.push(item);
      }

      datesSummary[dateStr] = {
        total: totalFiles,
        editsCount: dayHasEdits ? Math.max(editsCount, totalFiles >= 3 ? totalFiles - 2 : 1) : 0,
        baselinesCount,
        hasEdits: dayHasEdits,
      };
    }

    // Integrazione eventuali elementi in modifications.json non presenti sul disco locale
    for (const jsonIt of jsonItems) {
      if (!jsonIt.date) continue;
      const alreadyInList = allItems.some(it => it.filename === jsonIt.filename || it.id === jsonIt.id);
      if (!alreadyInList) {
        allItems.push(jsonIt);

        if (!datesSummary[jsonIt.date]) {
          datesSummary[jsonIt.date] = { total: 0, editsCount: 0, baselinesCount: 0, hasEdits: false };
        }
        datesSummary[jsonIt.date].total += 1;
        if (jsonIt.type === 'edit') {
          datesSummary[jsonIt.date].editsCount += 1;
          datesSummary[jsonIt.date].hasEdits = true;
        } else {
          datesSummary[jsonIt.date].baselinesCount += 1;
        }
      }
    }

    // Ri-verifica finale hasEdits su tutte le date censite
    for (const [d, s] of Object.entries(datesSummary)) {
      if (s.total >= 3 || s.editsCount > 0) {
        s.hasEdits = true;
        if (s.editsCount === 0 && s.total >= 3) {
          s.editsCount = Math.max(1, s.total - 2);
        }
      }
    }

    // 4. FILTRO PER DATA (SOLO SULL'ARRAY DI DETTAGLIO RESTITUITO)
    let filtered = allItems;
    if (filterDate) {
      filtered = allItems.filter(it => it.date === filterDate);
    }

    // Ordina per data e ora decrescente (i più recenti in alto)
    filtered.sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      return tb - ta;
    });

    const editsCount = filtered.filter(it => it.type === 'edit').length;
    const baselinesCount = filtered.filter(it => it.type === 'baseline').length;

    // Tutte le date disponibili ordinate decrescenti
    const availableDates = Array.from(new Set(Object.keys(datesSummary))).sort().reverse();

    return NextResponse.json({
      ok: true,
      filterDate: filterDate || null,
      total: filtered.length,
      editsCount,
      baselinesCount,
      availableDates,
      datesSummary,
      modifications: filtered,
    });
  } catch (error: any) {
    console.error('API Error in /api/odg/modifications:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Errore nel recupero delle modifiche ODG' },
      { status: 500 }
    );
  }
}
