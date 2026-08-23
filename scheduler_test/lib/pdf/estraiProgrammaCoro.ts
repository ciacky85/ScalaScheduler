'use client';
/**
 * estraiProgrammaCoro_v10.ts
 * - De-dup potente per significati dell'asterisco:
 *   1) Deduplica i segmenti del piè di pagina (split su | ; •).
 *   2) Appende solo i segmenti NON già presenti in descrizione (match normalizzato).
 *   3) Se tutti i segmenti sono già presenti, NON appende nulla.
 * - Resta invariato tutto il resto (niente trattini in descrizione; "* " visibile).
 */

import type { RigaCalendario } from '@/lib/types';
import * as pdfjs from 'pdfjs-dist';
import { v4 as uuidv4 } from 'uuid';

const genId = () => { try { return uuidv4(); } catch { return (Math.random() + 1).toString(36).slice(2); } };

if (typeof window !== 'undefined') {
  // @ts-ignore
  const v = (pdfjs as any).version || '4.6.82';
  // @ts-ignore
  (pdfjs as any).GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${v}/build/pdf.worker.min.mjs`;
}

const GIORNI = ['lunedì','martedì','mercoledì','giovedì','venerdì','sabato','domenica'];
const MESI   = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
const MESI_REGEX = MESI.join('|');
const monthYearRegex = new RegExp(`\\b(${MESI_REGEX})\\s+(\\d{4})\\b`, 'i');

// Esclusioni header/avvertenze, anche frammenti
const INTRO_PATTERNS: RegExp[] = [
  /fondazione\s+di\s+diritto\s+privato/i,
  /programma\s+quindicinale\s+prove\s+del\s+coro/i,
  /il\s+presente\s+ordine\s+delle\s+prove\s+è\s+indicativo/i,
  /può\s+subire\s+modifiche/i,
  /tutti\s+gli\s+interessati\s+devono\s+prendere\s+visione/i,
  /dell[’']ordine\s+del\s+giorno\.?/i,
  /ordine\s+del\s+giorno\.?/i,
];

const aggiornatoRegex = /aggiornato\s+il\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i;

const LUOGHI_HINT = [
  'PALCOSCENICO','PALCO','SALA PROVE','SALA CORO','RIDOTTO','FOYER','ANSALDO','PROVA ORCHESTRA','SALA'
];

const capIt = (s: string) => s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;
const normWs = (s: string) => s.replace(/\s+/g,' ').trim();
const hardTrim = (s: string) => (s ?? '').replace(/[\u00A0\u2007\u202F\t]/g, ' ').replace(/\s+/g,' ').trim();
const killDashes = (s: string) =>
  s.replace(/[–—]/g,' ')               // en/em dash -> space
   .replace(/\s-\s/g,' ')              // " - " token -> space
   .replace(/^-+|-+$/g,'')             // leading/trailing dashes
   .replace(/\s{2,}/g,' ')             // collapse spaces
   .trim();

// Normalizza per confronti (anti-dup)
const normForCompare = (s: string) =>
  (s || '')
    .toLowerCase()
    .replace(/[|;•]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Split e dedup dei segmenti nota
function splitAndDedupFootnote(text: string): string[] {
  const parts = (text || '')
    .split(/[|;•]/g)
    .map(p => hardTrim(p))
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = normForCompare(p);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

function buildLines(items: any[], yTol = 2): string[] {
  type Row = { y:number, cells: {x:number, str:string}[] };
  const rows: Row[] = [];
  for (const it of items) {
    if (!('str' in it) || !it.str || !it.transform) continue;
    const y = Math.round(it.transform[5]);
    const x = Math.round(it.transform[4]);
    let row = rows.find(r => Math.abs(r.y - y) <= yTol);
    if (!row) { row = { y, cells: [] }; rows.push(row); }
    row.cells.push({ x, str: it.str });
  }
  rows.sort((a,b) => b.y - a.y);
  return rows.map(r => normWs(r.cells.sort((a,b)=>a.x-b.x).map(c => c.str).join(' '))).filter(Boolean);
}

function pad2(n:number|string){ return String(n).padStart(2,'0'); }

function parseTimesBlob(text: string): { f1s?: string, f1e?: string, f2s?: string, f2e?: string } {
  const hits = (text.match(/(\d{1,2}[\.:]\d{2})/g) || [])
    .map(t => t.replace('.',':'))
    .map(t => t.length === 4 ? '0'+t : t);
  if (hits.length === 0) return {};
  if (hits.length === 1) return { f1s: hits[0] };
  if (hits.length === 2) return { f1s: hits[0], f1e: hits[1] };
  if (hits.length === 3) return { f1s: hits[0], f1e: hits[1], f2s: hits[2] };
  return { f1s: hits[0], f1e: hits[1], f2s: hits[2], f2e: hits[3] };
}

function buildDate(token: string, meseNome: string, anno: number): string | null {
  const m1 = token.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m1) return `${pad2(m1[1])}/${pad2(m1[2])}/${anno}`;
  const monthIdx = MESI.indexOf(meseNome.toLowerCase()) + 1;
  const m2 = token.match(/^(\d{1,2})$/);
  if (m2 && monthIdx>0) return `${pad2(m2[1])}/${pad2(monthIdx)}/${anno}`;
  return null;
}

const dayHeadRegex = new RegExp(`^\\s*(${GIORNI.join('|')})\\s+(\\d{1,2}(?:/\\d{1,2})?)\\b`, 'i');

type Estratto = { mese: string; anno: number; righe: RigaCalendario[], footnoteText?: string };

export async function estraiProgrammaCoro(file: File): Promise<Estratto> {
  const buf = await file.arrayBuffer();
  // @ts-ignore
  const pdf = await (pdfjs as any).getDocument({ data: buf }).promise;
  const allLines: string[] = [];
  for (let p=1; p<=pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // @ts-ignore
    allLines.push(...buildLines(content.items as any[], 2));
  }

  let cleaned = allLines.filter(l => !INTRO_PATTERNS.some(rx => rx.test(l)));

  // "Aggiornato il"
  let aggiornatoNote = '';
  for (const ln of cleaned) {
    const m = ln.match(aggiornatoRegex);
    if (m) {
      const dd = pad2(m[1]); const MM = pad2(m[2]);
      const yy = m[3].length === 2 ? `20${m[3]}` : m[3];
      aggiornatoNote = `Aggiornato il ${dd}/${MM}/${yy}`;
      break;
    }
  }

  // Mese/Anno
  let mese = '';
  let anno = new Date().getFullYear();
  for (const ln of cleaned) {
    const m = ln.match(monthYearRegex);
    if (m) { mese = capIt(m[1]); anno = parseInt(m[2],10); break; }
  }
  if (!mese) {
    const flat = cleaned.join(' ').toLowerCase();
    const mOnly = MESI.find(m => flat.includes(m));
    mese = mOnly ? capIt(mOnly) : capIt(MESI[new Date().getMonth()]);
  }

  // Pie' di pagina: righe che iniziano con "*"
  const rawFootnoteLines: string[] = cleaned.filter(l => /^\s*\*+\s+.+/.test(l));
  const footnoteParts = splitAndDedupFootnote(rawFootnoteLines.map(l => l.replace(/^\s*\*+\s*/, '')).join(' | '));
  const footnoteText = footnoteParts.join(' | ');

  // Rimuovi note "* ..." e righe composte solo da asterischi
  cleaned = cleaned.filter(l => !/^\s*\*+\s+.+/.test(l) && !/^\s*\*+\s*$/.test(l));

  const righe: RigaCalendario[] = [];
  let curHeader: { dow: string; date: string|null } | null = null;
  let buffer: string[] = [];
  let parsingStarted = false;

  const sanitize = (s: string) => killDashes(hardTrim(s));

  const flush = () => {
    if (!curHeader) return;
    const { dow, date } = curHeader;

    if (buffer.length === 0) {
      righe.push({
        id: genId(),
        selected: false,
        giornoSettimanale: dow,
        data: date ?? 'data_invalida',
        descrizione: '',
        dettaglio: '',
        luogo: '',
        stato: date ? 'ok' : 'da_revisionare',
        rawText: ''
      });
      return;
    }

    for (const raw of buffer) {
      const ln = sanitize(raw);
      const low = ln.toLowerCase();
      if (INTRO_PATTERNS.some(rx => rx.test(ln))) continue;

      if (low.includes('riposo') || low.includes('festivo')) {
        righe.push({
          id: genId(),
          selected: false,
          giornoSettimanale: dow,
          data: date ?? 'data_invalida',
          descrizione: low.includes('riposo') ? 'Riposo' : 'Festivo',
          dettaglio: '',
          luogo: '',
          stato: date ? 'ok' : 'da_revisionare',
          rawText: raw,
        });
        continue;
      }

      const times = parseTimesBlob(ln);

      // Rimuovi orari e asterischi; niente trattini, uni solo con spazi
      let desc = ln.replace(/(\d{1,2}[\.:]\d{2})/g, ' ');
      const hadAsterisk = /(^|[^*])\*([^*]|$)/.test(desc);
      desc = desc.replace(/\*/g, ' ');
      desc = sanitize(desc);

      // Luogo
      let luogo = '';
      const upper = desc.toUpperCase();
      for (const hint of LUOGHI_HINT) { if (upper.includes(hint)) { luogo = hint; break; } }

      // Append significato * in descrizione, prefissato "* " (senza trattini), evitando duplicati normalizzati
      if (hadAsterisk && footnoteParts.length) {
        const normalizedDesc = normForCompare(desc);
        const partsToAppend: string[] = [];
        for (const p of footnoteParts) {
          const starPart = `* ${p}`;
          if (!normalizedDesc.includes(normForCompare(starPart))) {
            partsToAppend.push(starPart);
          }
        }
        if (partsToAppend.length) {
          desc = desc ? `${desc} ${partsToAppend.join(' | ')}` : partsToAppend.join(' | ');
        }
      }

      righe.push({
        id: genId(),
        selected: true,
        giornoSettimanale: dow,
        data: date ?? 'data_invalida',
        descrizione: desc,
        dettaglio: '',
        luogo,
        fascia1Start: times.f1s,
        fascia1End:   times.f1e,
        fascia2Start: times.f2s,
        fascia2End:   times.f2e,
        stato: date ? 'ok' : 'da_revisionare',
        rawText: raw
      });
    }

    buffer = [];
  };

  for (const raw of cleaned) {
    const line = sanitize(raw);
    if (!line) continue;

    const m = line.match(dayHeadRegex);
    if (m) {
      parsingStarted = true;
      flush();

      const dow = capIt(m[1]);
      const token = m[2];
      const built = buildDate(token, mese, anno);
      curHeader = { dow, date: built };

      const rest = line.slice(m[0].length).trim();
      buffer = [];
      if (rest) buffer.push(rest);
      continue;
    }

    if (!parsingStarted) continue;
    if (monthYearRegex.test(line)) continue;
    if (INTRO_PATTERNS.some(rx => rx.test(line))) continue;

    // Linee luogo in maiuscolo isolate → concatena
    if (buffer.length && /^([A-ZÀ-Ú ]{4,})$/.test(line)) {
      buffer[buffer.length - 1] = normWs(buffer[buffer.length - 1] + ' ' + line);
      continue;
    }

    buffer.push(line);
  }
  flush();

  if (!righe.length) throw new Error('Nessun evento trovato.');

  const toKey = (r: RigaCalendario) => {
    const [dd,MM,yyyy] = (r.data || '01/01/1970').split('/').map(Number);
    const t = (r.fascia1Start || '00:00');
    const [hh,mm] = t.split(':').map(Number);
    return new Date(yyyy || 1970, (MM||1)-1, dd||1, hh||0, mm||0).getTime();
  };
  righe.sort((a,b) => toKey(a) - toKey(b));

  return { mese, anno, righe, footnoteText };
}
