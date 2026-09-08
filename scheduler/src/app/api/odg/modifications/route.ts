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
    path.join(process.cwd(), 'public', 'odg_shots', 'modifications.json'),
    '/data/modifications.json',
    path.join(process.cwd(), 'odg_shots', 'modifications.json'),
  ];
}

function getCandidateShotsDirs(): string[] {
  return [
    '/data/odg_shots',
    path.join(process.cwd(), 'public', 'odg_shots'),
    path.join(process.cwd(), 'odg_shots'),
  ];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filterDate = searchParams.get('date'); // es. "2026-09-08"

    let items: ModificationItem[] = [];

    // 1. Prova a caricare dal file JSON persistente
    for (const p of getCandidateModificationsPaths()) {
      if (existsSync(p)) {
        try {
          const raw = await fs.readFile(p, 'utf-8');
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            items = parsed;
            break;
          }
        } catch (e: any) {
          console.error(`[modifications-api] Errore lettura ${p}:`, e.message);
        }
      }
    }

    // 2. Integrazione da scansione cartella per trovare screenshot fisici su disco
    const existingFileNames = new Set(items.map(it => it.filename));
    for (const baseDir of getCandidateShotsDirs()) {
      if (existsSync(baseDir)) {
        try {
          const subdirs = readdirSync(baseDir, { withFileTypes: true })
            .filter(d => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
            .map(d => d.name);

          for (const dayDirName of subdirs) {
            if (filterDate && dayDirName !== filterDate) continue;
            const fullDayDir = path.join(baseDir, dayDirName);
            const files = readdirSync(fullDayDir);

            for (const file of files) {
              if (!file.toLowerCase().endsWith('.png')) continue;
              if (existingFileNames.has(file)) continue;

              const isEdit = file.includes('_edit');
              const isBaseline = !isEdit;
              const filePath = path.join(fullDayDir, file);
              const stats = statSync(filePath);
              const mtime = stats.mtime;

              // Estrai url_name dal filename (es: 2026-09-08_143025_odg_0_edit.png)
              let urlName = 'odg_0';
              if (file.includes('odg_1')) urlName = 'odg_1';
              else if (file.includes('odg_0')) urlName = 'odg_0';

              const timeFormatted = mtime.toLocaleTimeString('it-IT', { hour12: false });
              items.push({
                id: `disc_${dayDirName}_${file}`,
                timestamp: mtime.toISOString(),
                date: dayDirName,
                time: timeFormatted,
                url_name: urlName,
                type: isEdit ? 'edit' : 'baseline',
                filename: file,
                relative_path: `${dayDirName}/${file}`,
                note: isEdit ? 'Screenshot di modifica rilevata (da disco)' : 'Screenshot baseline del giorno',
              });
              existingFileNames.add(file);
            }
          }
        } catch (dirErr: any) {
          console.error('[modifications-api] Errore scansione cartella:', dirErr.message);
        }
      }
    }

    // 3. Calcola il riepilogo per data (datesSummary) su tutti gli elementi rilevati
    const datesSummary: Record<string, { total: number; editsCount: number; baselinesCount: number; hasEdits: boolean }> = {};
    for (const it of items) {
      if (!it.date) continue;
      if (!datesSummary[it.date]) {
        datesSummary[it.date] = { total: 0, editsCount: 0, baselinesCount: 0, hasEdits: false };
      }
      datesSummary[it.date].total += 1;
      if (it.type === 'edit') {
        datesSummary[it.date].editsCount += 1;
        datesSummary[it.date].hasEdits = true;
      } else if (it.type === 'baseline') {
        datesSummary[it.date].baselinesCount += 1;
      }
    }

    // 4. Filtra per data se specificato
    let filtered = items;
    if (filterDate) {
      filtered = items.filter(it => it.date === filterDate);
    }

    // 5. Ordina per data e ora decrescente (le modifiche più recenti in alto)
    filtered.sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      return tb - ta;
    });

    // Calcola statistiche per la data filtrata
    const editsCount = filtered.filter(it => it.type === 'edit').length;
    const baselinesCount = filtered.filter(it => it.type === 'baseline').length;

    // Raggruppa tutte le date disponibili ordinate
    const availableDates = Array.from(new Set(items.map(it => it.date))).sort().reverse();

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
