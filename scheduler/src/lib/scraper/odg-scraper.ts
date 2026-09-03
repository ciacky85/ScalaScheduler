import fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import type { ScraperConfig, ScraperStatus } from '@/lib/types';
export type { ScraperConfig, ScraperStatus };

const DEFAULT_CONFIG: ScraperConfig = {
  urls: [
    'https://erp.teatroallascala.org/pianificazione11/faces/DSSC/pxf_dspagine_coro.xhtml?pps=0',
    'https://erp.teatroallascala.org/pianificazione11/faces/DSSC/pxf_dspagine_coro.xhtml?pps=1',
  ],
  output_file: '/data/odg_structured.json',
  schedules: ['07:00', '21:00'],
  run_on_start: true,
};

function getCandidateConfigPaths(): string[] {
  return [
    '/data/config.json',
    '/app/config/config.json',
    path.join(process.cwd(), 'public', 'config.json'),
    path.join(process.cwd(), 'src', 'app', 'config', 'scraper_config.json'),
    path.join(process.cwd(), 'config', 'config.json'),
  ];
}

function getCandidateDataPaths(): string[] {
  return [
    '/data/odg_structured.json',
    path.join(process.cwd(), 'public', 'odg_structured.json'),
    path.join(process.cwd(), 'odg_structured.json'),
  ];
}

function normalizeUrlList(rawUrls: any): string[] {
  if (!Array.isArray(rawUrls)) return DEFAULT_CONFIG.urls;
  const result: string[] = [];
  for (const item of rawUrls) {
    if (typeof item === 'string' && item.trim()) {
      result.push(item.trim());
    } else if (item && typeof item === 'object') {
      const u = item.url || item.name || '';
      if (typeof u === 'string' && u.trim()) {
        result.push(u.trim());
      }
    }
  }
  return result.length > 0 ? result : DEFAULT_CONFIG.urls;
}

export function getResolvedConfigPath(): string {
  for (const p of getCandidateConfigPaths()) {
    if (existsSync(p)) return p;
  }
  return path.join(process.cwd(), 'public', 'config.json');
}

export function getResolvedDataPath(): string {
  for (const p of getCandidateDataPaths()) {
    if (existsSync(p)) return p;
  }
  return path.join(process.cwd(), 'public', 'odg_structured.json');
}

export async function loadScraperConfig(): Promise<{ config: ScraperConfig; filePath: string }> {
  const filePath = getResolvedConfigPath();
  try {
    if (existsSync(filePath)) {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      return {
        config: {
          urls: normalizeUrlList(parsed.urls),
          output_file: parsed.output_file || DEFAULT_CONFIG.output_file,
          schedules: Array.isArray(parsed.schedules) ? parsed.schedules.map(String) : DEFAULT_CONFIG.schedules,
          run_on_start: parsed.run_on_start !== undefined ? Boolean(parsed.run_on_start) : DEFAULT_CONFIG.run_on_start,
        },
        filePath,
      };
    }
  } catch (err) {
    console.error('[ScraperLib] Errore lettura config scraper:', err);
  }

  return { config: DEFAULT_CONFIG, filePath };
}

export async function saveScraperConfig(newConfig: Partial<ScraperConfig>): Promise<{ config: ScraperConfig; savedPath: string }> {
  const { config: current } = await loadScraperConfig();
  const updated: ScraperConfig = {
    urls: normalizeUrlList(newConfig.urls && newConfig.urls.length > 0 ? newConfig.urls : current.urls),
    output_file: newConfig.output_file || current.output_file,
    schedules: Array.isArray(newConfig.schedules) && newConfig.schedules.length > 0 ? newConfig.schedules.map(String) : current.schedules,
    run_on_start: newConfig.run_on_start !== undefined ? Boolean(newConfig.run_on_start) : current.run_on_start,
  };

  const primaryPath = path.join(process.cwd(), 'public', 'config.json');
  const dir = path.dirname(primaryPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(primaryPath, JSON.stringify(updated, null, 2), 'utf-8');

  // Copia anche in /data/config.json se la directory /data esiste (ambiente Docker)
  try {
    if (existsSync('/data')) {
      await fs.writeFile('/data/config.json', JSON.stringify(updated, null, 2), 'utf-8');
    }
  } catch (_) {}

  return { config: updated, savedPath: primaryPath };
}

export async function getScraperStatus(): Promise<ScraperStatus> {
  const configPath = getResolvedConfigPath();
  const dataPath = getResolvedDataPath();

  let lastGeneratedAt: string | null = null;
  let pageCount = 0;
  let totalRows = 0;
  const pagesSummary: ScraperStatus['pages'] = [];

  const dataFileFound = existsSync(dataPath);

  if (dataFileFound) {
    try {
      const raw = await fs.readFile(dataPath, 'utf-8');
      const json = JSON.parse(raw);
      lastGeneratedAt = json.export_generated_at || null;
      if (Array.isArray(json.pages)) {
        pageCount = json.pages.length;
        for (const pg of json.pages) {
          const rows = pg?.table?.rows?.length || 0;
          totalRows += rows;
          pagesSummary.push({
            url: pg.source_url || '',
            dateLabel: pg?.date?.label || null,
            dateIso: pg?.date?.iso || null,
            lastUpdateRaw: pg?.last_update?.raw || null,
            rowCount: rows,
          });
        }
      }
    } catch (e) {
      console.error('[ScraperLib] Errore lettura dati ODG:', e);
    }
  }

  return {
    lastGeneratedAt,
    pageCount,
    totalRows,
    pages: pagesSummary,
    configFileFound: existsSync(configPath),
    configPath,
    dataFileFound,
    dataPath,
  };
}

// ==========================================
// Scraping Nativo TypeScript (Fallback / On-Demand)
// ==========================================

const IT_MONTHS: Record<string, number> = {
  GENNAIO: 1, FEBBRAIO: 2, MARZO: 3, APRILE: 4, MAGGIO: 5, GIUGNO: 6,
  LUGLIO: 7, AGOSTO: 8, SETTEMBRE: 9, OTTOBRE: 10, NOVEMBRE: 11, DICEMBRE: 12,
};

const DATE_HEADER_RE = /(LUNEDÌ|MARTEDÌ|MERCOLEDÌ|GIOVEDÌ|VENERDÌ|SABATO|DOMENICA)\s+(\d{1,2})\s+([A-ZÀ-Ú]+)\s+(\d{4})/i;
const LAST_UPDATE_RE = /Agg\.?\s*(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2})/i;
const TIME_RANGE_RE = /\b([01]?\d|2[0-3]):([0-5]\d)\s*[-–—]\s*([01]?\d|2[0-3]):([0-5]\d)\b/;
const TIME_RE = /\b([01]?\d|2[0-3]):([0-5]\d)\b/;

function classifyPlace(raw: string): string {
  const lp = raw.toLowerCase();
  if (lp.includes('ansaldo')) return 'ansaldo';
  if (lp.includes('sala')) return 'sala';
  if (lp.includes('teatro')) return 'teatro';
  if (lp.includes('ridotto')) return 'ridotto';
  if (lp.includes('palco')) return 'palco';
  if (lp.includes('studio')) return 'studio';
  return 'altro';
}

function normalizeCap(s: string): string {
  const tr = s.trim();
  if (!tr) return tr;
  return tr
    .split(/\s+/)
    .map(w => (/^[a-zA-Zà-úÀ-Ú]+$/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

function parseTimeRange(raw: string) {
  const normalized = raw.replace(/[–—]/g, '-');
  const m = normalized.match(TIME_RANGE_RE);
  if (m) {
    const start = `${String(m[1]).padStart(2, '0')}:${m[2]}`;
    const end = `${String(m[3]).padStart(2, '0')}:${m[4]}`;
    return { raw: m[0], start, end, tz: 'Europe/Rome' };
  }
  const m2 = raw.match(TIME_RE);
  if (m2) {
    const start = `${String(m2[1]).padStart(2, '0')}:${m2[2]}`;
    return { raw: start, start, end: null, tz: 'Europe/Rome' };
  }
  return { raw: raw.trim(), start: null, end: null, tz: 'Europe/Rome' };
}

function cleanFootnote(fn: string): string {
  let s = fn.replace(/^(?:Note|Nota)\s*:\s*/i, '').trim();
  s = s.replace(/^\*+\s*/, '').trim();
  return s.replace(/\s+/g, ' ');
}

export async function runScraperNative(): Promise<{ ok: boolean; pagesScraped: number; totalRows: number; outputPath: string }> {
  const { config } = await loadScraperConfig();
  const pagesResult: any[] = [];

  for (const url of config.urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (ODG-Scraper/TS-Native 2.4)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const html = await res.text();

      // Parsing HTML con regex/DOM parsing leggero server-side
      const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

      // Data header
      let dateLabel: string | null = null;
      let dateIso: string | null = null;
      const mDate = plainText.match(DATE_HEADER_RE);
      if (mDate) {
        dateLabel = mDate[0].trim();
        const day = parseInt(mDate[2], 10);
        const monthName = mDate[3].toUpperCase();
        const year = parseInt(mDate[4], 10);
        const month = IT_MONTHS[monthName];
        if (month) {
          dateIso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }

      // Last update
      let lastUpdRaw: string | null = null;
      let lastUpdIso: string | null = null;
      const mUpd = plainText.match(LAST_UPDATE_RE);
      if (mUpd) {
        lastUpdRaw = `Agg. ${mUpd[1]}`;
      }

      // Estrazione note
      const footnotes: string[] = [];
      const noteMatches = html.matchAll(/(?:Note|Nota)\s*:\s*([^<]+)/gi);
      for (const nm of noteMatches) {
        const cleaned = cleanFootnote(nm[1]);
        if (cleaned && !footnotes.includes(cleaned)) footnotes.push(cleaned);
      }

      // Estrazione righe da <tr>
      const trMatches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
      const structuredRows: any[] = [];

      for (const trMatch of trMatches) {
        const trContent = trMatch[1];
        const cellMatches = Array.from(trContent.matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi));
        const cells = cellMatches
          .map(c => c[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
          .filter(Boolean);

        if (cells.length < 3) continue;

        const joined = cells.join(' | ');
        if (!TIME_RE.test(joined)) continue;
        if (/^(?:Note|Nota)\b/i.test(cells[0])) continue;

        const cells4 = [...cells, '', '', '', ''].slice(0, 4);
        const recipient = cells4[0];
        const placeRaw = cells4[1];
        const timeRaw = cells4[2];
        let descRaw = cells4[3];

        // Se c'è asterisco, appende le note
        if (descRaw.includes('*') || placeRaw.includes('*') || recipient.includes('*')) {
          if (footnotes.length > 0) {
            const missing = footnotes.filter(f => !descRaw.toLowerCase().includes(f.toLowerCase()));
            if (missing.length > 0) {
              const noteText = missing.join(' - ');
              descRaw = descRaw.endsWith('-') ? `${descRaw} ${noteText}` : `${descRaw} - ${noteText}`;
            }
          }
        }

        const flags: string[] = [];
        if (descRaw.includes('*')) flags.push('asterisk');

        const details: string[] = [];
        let title = descRaw;
        if (descRaw.includes(' - ')) {
          const parts = descRaw.split(' - ').map(p => p.trim()).filter(Boolean);
          if (parts.length > 0) {
            title = parts[0];
            details.push(...parts.slice(1));
          }
        }

        structuredRows.push({
          row_index: structuredRows.length,
          recipient: {
            raw: recipient,
            normalized: normalizeCap(recipient),
            category: recipient.toLowerCase().includes('coro') ? 'coro' : null,
          },
          place: {
            raw: placeRaw,
            normalized: normalizeCap(placeRaw),
            location_type: classifyPlace(placeRaw),
          },
          time: parseTimeRange(timeRaw),
          description: {
            raw: descRaw,
            title,
            details,
            flags,
          },
          provenance: {
            tokens: [recipient, placeRaw, timeRaw, descRaw],
          },
        });
      }

      pagesResult.push({
        source_url: url,
        date: { label: dateLabel, iso: dateIso },
        last_update: { raw: lastUpdRaw, iso: lastUpdIso },
        table: {
          columns: [
            { key: 'recipient', label: 'Destinatario' },
            { key: 'place', label: 'Luogo' },
            { key: 'time', label: 'Fascia oraria' },
            { key: 'description', label: 'Descrizione' },
          ],
          rows: structuredRows,
        },
        stats: { row_count: structuredRows.length },
      });
    } catch (e: any) {
      console.error(`[ScraperLib] Errore scrape per ${url}:`, e.message);
      pagesResult.push({
        source_url: url,
        date: { label: null, iso: null },
        last_update: { raw: null, iso: null },
        table: { columns: [], rows: [] },
        stats: { row_count: 0 },
      });
    }
  }

  const payload = {
    export_generated_at: new Date().toISOString(),
    pages: pagesResult,
  };

  const primaryOut = path.join(process.cwd(), 'public', 'odg_structured.json');
  await fs.mkdir(path.dirname(primaryOut), { recursive: true });
  await fs.writeFile(primaryOut, JSON.stringify(payload, null, 2), 'utf-8');

  try {
    if (existsSync('/data')) {
      await fs.writeFile('/data/odg_structured.json', JSON.stringify(payload, null, 2), 'utf-8');
    }
  } catch (_) {}

  const totalRows = pagesResult.reduce((sum, p) => sum + (p.stats?.row_count || 0), 0);

  return {
    ok: true,
    pagesScraped: pagesResult.length,
    totalRows,
    outputPath: primaryOut,
  };
}
