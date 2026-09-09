import fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { getServiceAccount } from '@/lib/drive/google-drive';
import { createHash } from 'crypto';
import { add, format, parseISO } from 'date-fns';
import { toZonedTime, formatInTimeZone } from 'date-fns-tz';

export interface ODGRowData {
  row_index: number;
  recipient: { raw: string | null; normalized: string | null; category?: string | null };
  place: { raw: string | null; normalized: string | null; location_type?: string | null };
  time: { raw: string | null; start: string | null; end: string | null; tz?: string | null };
  description: { raw: string | null; title: string | null; details: string[]; flags?: string[] };
  provenance?: { tokens?: string[] };
  raw_line?: string | null;
}

export interface ODGPage {
  source_url: string;
  date: { label: string | null; iso: string | null };
  last_update: { raw: string | null; iso: string | null };
  table: { rows: ODGRowData[] };
}

export interface ODGPayload {
  export_generated_at: string;
  pages: ODGPage[];
}

export interface CalendarEntry {
  id?: string;
  label?: string;
  calendarId: string;
  tipo?: string;
  predefinito?: boolean;
}

export interface CalendarsConfig {
  importaCalendario?: CalendarEntry[];
  odg?: CalendarEntry[];
}

export interface SyncStats {
  scanned: number;
  inserted: number;
  updated: number;
  unchanged: number;
  deleted: number;
  skipped: number;
}

export interface DetailLog {
  odg_uid: string;
  date: string;
  action: 'insert' | 'update' | 'skip' | 'delete';
  reason: string;
}

export interface SyncResult {
  ok: boolean;
  calendarId?: string;
  dryRun?: boolean;
  stats: SyncStats;
  details: DetailLog[];
  error?: string;
  where?: string;
}

const TIMEZONE = 'Europe/Rome';
const DEFAULT_DURATION_MIN = 90;
const LOG_FILE_PATH = path.join(process.cwd(), 'public', 'odg_sync.log');

const RANGE_RE = /\b([01]?\d|2[0-3]):([0-5]\d)\s*[-–—]\s*([01]?\d|2[0-3]):([0-5]\d)\b/;
const TIME_RE = /\b([01]?\d|2[0-3]):([0-5]\d)\b/;

export const logSyncMessage = async (message: string) => {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message}\n`;
  try {
    const logDir = path.dirname(LOG_FILE_PATH);
    if (!existsSync(logDir)) {
      await fs.mkdir(logDir, { recursive: true });
    }
    await fs.appendFile(LOG_FILE_PATH, logMessage, 'utf-8');
  } catch (error) {
    console.error('[odg-sync] Impossibile scrivere sul file di log:', error);
  }
};

const createAuth = () => {
  const sa = getServiceAccount();
  return new JWT({
    email: sa.client_email || '',
    key: sa.private_key || '',
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
};

const sha1 = (data: string): string => createHash('sha1').update(data).digest('hex');
const normalizeForUid = (s: string | null | undefined) => (s ?? '').trim().toUpperCase().replace(/\s+/g, ' ');

export function getCandidateCalendarPaths(): string[] {
  return [
    '/app/config/calendars.json',
    '/data/calendars.json',
    '/app/src/app/config/calendars.json',
    path.join(process.cwd(), 'src', 'app', 'config', 'calendars.json'),
    path.join(process.cwd(), 'config', 'calendars.json'),
    path.join(process.cwd(), 'calendars.json'),
  ];
}

export function resolveOdgCalendarId(): string {
  for (const p of getCandidateCalendarPaths()) {
    if (existsSync(p)) {
      try {
        const raw = readFileSync(p, 'utf-8');
        const config: CalendarsConfig = JSON.parse(raw);
        const odgList = config.odg || [];
        const found = odgList.find(c => Boolean(c.predefinito)) || odgList[0];
        if (found?.calendarId && found.calendarId.trim()) {
          return found.calendarId.trim();
        }
      } catch (err: any) {
        console.error(`[odg-sync] Errore lettura calendario da ${p}:`, err.message);
      }
    }
  }
  throw new Error('Nessun calendario ODG trovato nei file di configurazione (calendars.json).');
}

export function getCandidateOdgDataPaths(): string[] {
  return [
    '/data/odg_structured.json',
    path.join(process.cwd(), 'public', 'odg_structured.json'),
    path.join(process.cwd(), 'odg_structured.json'),
  ];
}

export function getResolvedOdgDataPath(): string {
  for (const p of getCandidateOdgDataPaths()) {
    if (existsSync(p)) return p;
  }
  return path.join(process.cwd(), 'public', 'odg_structured.json');
}

function getEventTimes(row: ODGRowData): { start: string | null; end: string | null; where: string } {
  if (row.time?.start) {
    return { start: row.time.start, end: row.time?.end ?? null, where: 'structured' };
  }

  if (row.time?.raw) {
    const raw = String(row.time.raw);
    const r = raw.match(RANGE_RE);
    if (r) return { start: `${r[1]}:${r[2]}`, end: `${r[3]}:${r[4]}`, where: 'time.raw:range' };
    const s = raw.match(TIME_RE);
    if (s) return { start: `${s[1]}:${s[2]}`, end: null, where: 'time.raw:single' };
  }

  if (row.description?.details && Array.isArray(row.description.details)) {
    for (const d of row.description.details) {
      const r = String(d).match(RANGE_RE);
      if (r) return { start: `${r[1]}:${r[2]}`, end: `${r[3]}:${r[4]}`, where: 'desc.details:range' };
      const s = String(d).match(TIME_RE);
      if (s) return { start: `${s[1]}:${s[2]}`, end: null, where: 'desc.details:single' };
    }
  }

  if (row.description?.raw) {
    const raw = String(row.description.raw);
    const r = raw.match(RANGE_RE);
    if (r) return { start: `${r[1]}:${r[2]}`, end: `${r[3]}:${r[4]}`, where: 'desc.raw:range' };
    const s = raw.match(TIME_RE);
    if (s) return { start: `${s[1]}:${s[2]}`, end: null, where: 'desc.raw:single' };
  }

  if (row.place?.raw) {
    const raw = String(row.place.raw);
    const r = raw.match(RANGE_RE);
    if (r) return { start: `${r[1]}:${r[2]}`, end: `${r[3]}:${r[4]}`, where: 'place.raw:range' };
    const s = raw.match(TIME_RE);
    if (s) return { start: `${s[1]}:${s[2]}`, end: null, where: 'place.raw:single' };
  }

  if (row.recipient?.raw) {
    const raw = String(row.recipient.raw);
    const r = raw.match(RANGE_RE);
    if (r) return { start: `${r[1]}:${r[2]}`, end: `${r[3]}:${r[4]}`, where: 'recipient.raw:range' };
    const s = raw.match(TIME_RE);
    if (s) return { start: `${s[1]}:${s[2]}`, end: null, where: 'recipient.raw:single' };
  }

  if (row.raw_line) {
    const rl = String(row.raw_line);
    const r = rl.match(RANGE_RE);
    if (r) return { start: `${r[1]}:${r[2]}`, end: `${r[3]}:${r[4]}`, where: 'raw_line:range' };
    const s = rl.match(TIME_RE);
    if (s) return { start: `${s[1]}:${s[2]}`, end: null, where: 'raw_line:single' };
  }

  return { start: null, end: null, where: 'not-found' };
}

function generateEventUid(dateIso: string, row: ODGRowData, start: string | null, end: string | null): string {
  const parts = [
    'odg',
    dateIso,
    start || '',
    end || '',
    normalizeForUid(row.description?.raw),
    normalizeForUid(row.recipient?.raw),
    normalizeForUid(row.place?.raw),
  ];
  return parts.join('|');
}

function generateContentHash(summary: string, location: string, description: string, start: any, end: any): string {
  const content = JSON.stringify({ summary, location, description, start, end });
  return sha1(content);
}

export async function runOdgCalendarSync(options?: {
  calendarId?: string;
  dryRun?: boolean;
}): Promise<SyncResult> {
  const dryRun = Boolean(options?.dryRun);
  let calendarId = options?.calendarId?.trim();

  if (!calendarId) {
    calendarId = resolveOdgCalendarId();
  }

  const stats: SyncStats = { scanned: 0, inserted: 0, updated: 0, unchanged: 0, deleted: 0, skipped: 0 };
  const details: DetailLog[] = [];

  try {
    await logSyncMessage(`[ODG SYNC START] Calendar ID: ${calendarId}, Dry Run: ${dryRun}`);

    const dataPath = getResolvedOdgDataPath();
    if (!existsSync(dataPath)) {
      throw new Error(`File dati ODG non trovato (verificati percorsi candidati, default: ${dataPath})`);
    }

    const fileContent = readFileSync(dataPath, 'utf-8');
    const payload: ODGPayload = JSON.parse(fileContent);

    if (!payload.pages || !Array.isArray(payload.pages)) {
      throw new Error('Formato JSON odg_structured non valido: campo pages mancante o non array.');
    }

    const auth = createAuth();
    const calendar = google.calendar({ version: 'v3', auth });

    const sourceEvents = new Map<string, any>();
    const datesToSync = new Set<string>();

    for (const page of payload.pages) {
      if (!page.date?.iso) continue;
      const eventDate = page.date.iso;
      datesToSync.add(eventDate);

      const rows = page.table?.rows || [];
      for (const row of rows) {
        stats.scanned++;

        const { start: rawStart, end: rawEnd } = getEventTimes(row);

        if (!rawStart) {
          stats.skipped++;
          const uid = generateEventUid(eventDate, row, null, null);
          details.push({ odg_uid: uid, date: eventDate, action: 'skip', reason: 'no time found' });
          continue;
        }

        const startDateTime = `${eventDate}T${rawStart}:00`;
        let endDateTime: string;

        if (rawEnd) {
          endDateTime = `${eventDate}T${rawEnd}:00`;
        } else {
          const zonedStartDate = toZonedTime(parseISO(startDateTime), TIMEZONE);
          const endDate = add(zonedStartDate, { minutes: DEFAULT_DURATION_MIN });
          endDateTime = format(endDate, "yyyy-MM-dd'T'HH:mm:ss");
        }

        const finalStart = rawStart;
        const finalEnd = endDateTime.split('T')[1].substring(0, 5);
        const odg_uid = generateEventUid(eventDate, row, finalStart, finalEnd);

        const summary = [row.recipient?.raw, row.place?.raw, row.description?.raw]
          .filter(Boolean)
          .join(' - ')
          .slice(0, 1024);

        const location = row.place?.raw || '';

        const eventDescription = [
          row.description?.raw || '',
          '',
          `Partecipanti: ${row.recipient?.raw || ''}`,
          `Agg. Pagina Scala: ${page.last_update?.raw || 'N/D'}`,
          `Fonte: ${page.source_url}`,
          `Export file: ${payload.export_generated_at}`,
        ].join('\n');

        const eventStart = { dateTime: startDateTime, timeZone: TIMEZONE };
        const eventEnd = { dateTime: endDateTime, timeZone: TIMEZONE };

        const odg_content_hash = generateContentHash(summary, location, eventDescription, eventStart, eventEnd);

        sourceEvents.set(odg_uid, {
          summary,
          location,
          description: eventDescription,
          start: eventStart,
          end: eventEnd,
          extendedProperties: {
            private: {
              odg_uid,
              odg_content_hash,
              odg_date_iso: eventDate,
              odg_last_update_raw: page.last_update?.raw || '',
              odg_last_update_iso: page.last_update?.iso || '',
              odg_source_url: page.source_url,
              odg_export_generated_at: payload.export_generated_at,
            },
          },
        });
      }
    }

    const existingEvents = new Map<string, any>();
    for (const date of datesToSync) {
      let timeMin: string;
      let timeMax: string;
      try {
        timeMin = formatInTimeZone(new Date(`${date}T00:00:00`), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
        timeMax = formatInTimeZone(new Date(`${date}T23:59:59`), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
      } catch {
        timeMin = `${date}T00:00:00+01:00`;
        timeMax = `${date}T23:59:59+01:00`;
      }

      const res = await calendar.events.list({
        calendarId,
        timeMin,
        timeMax,
        singleEvents: true,
      });

      res.data.items?.forEach(event => {
        const uid = event.extendedProperties?.private?.odg_uid;
        if (uid) {
          if (existingEvents.has(uid)) {
            stats.deleted++;
            details.push({ odg_uid: uid, date, action: 'delete', reason: 'duplicate uid found' });
            if (!dryRun && event.id) {
              calendar.events.delete({ calendarId, eventId: event.id }).catch(e =>
                logSyncMessage(`ERROR: Impossibile eliminare evento duplicato ${event.id}: ${e.message}`)
              );
            }
          } else {
            existingEvents.set(uid, event);
          }
        }
      });
    }

    // Upsert (Insert / Update / Unchanged)
    for (const [uid, eventData] of sourceEvents.entries()) {
      const existingEvent = existingEvents.get(uid);

      if (!existingEvent) {
        stats.inserted++;
        const logDetail: DetailLog = {
          odg_uid: uid,
          date: eventData.extendedProperties.private.odg_date_iso,
          action: 'insert',
          reason: 'new event',
        };
        details.push(logDetail);
        await logSyncMessage(`  - [INSERT] ${uid} (Date: ${logDetail.date}): Nuovo evento.`);
        if (!dryRun) {
          await calendar.events.insert({ calendarId, requestBody: eventData });
        }
      } else {
        const existingHash = existingEvent.extendedProperties?.private?.odg_content_hash;
        const newHash = eventData.extendedProperties.private.odg_content_hash;

        if (existingHash !== newHash) {
          stats.updated++;
          const logDetail: DetailLog = {
            odg_uid: uid,
            date: eventData.extendedProperties.private.odg_date_iso,
            action: 'update',
            reason: 'content changed',
          };
          details.push(logDetail);
          await logSyncMessage(`  - [UPDATE] ${uid} (Date: ${logDetail.date}): Contenuto modificato.`);
          if (!dryRun && existingEvent.id) {
            await calendar.events.update({
              calendarId,
              eventId: existingEvent.id,
              requestBody: eventData,
            });
          }
        } else {
          stats.unchanged++;
          const logDetail: DetailLog = {
            odg_uid: uid,
            date: eventData.extendedProperties.private.odg_date_iso,
            action: 'skip',
            reason: 'content unchanged',
          };
          details.push(logDetail);
        }
        existingEvents.delete(uid);
      }
    }

    // Cancella eventi rimasti sul calendario ma non più presenti nel file sorgente
    for (const [uid, eventToDelete] of existingEvents.entries()) {
      const dateToDelete = eventToDelete.extendedProperties?.private?.odg_date_iso;
      // Sicurezza: cancella solo eventi appartenenti alle date effettivamente sincronizzate
      if (dateToDelete && !datesToSync.has(dateToDelete)) {
        continue;
      }
      stats.deleted++;
      const effectiveDate = dateToDelete || 'unknown';
      const logDetail: DetailLog = {
        odg_uid: uid,
        date: effectiveDate,
        action: 'delete',
        reason: 'event not in source',
      };
      details.push(logDetail);
      await logSyncMessage(`  - [DELETE] ${uid} (Date: ${effectiveDate}): Non più presente nel sorgente.`);
      if (!dryRun && eventToDelete.id) {
        await calendar.events.delete({ calendarId, eventId: eventToDelete.id });
      }
    }

    await logSyncMessage(
      `[ODG SYNC COMPLETED] Scanned=${stats.scanned}, Inserted=${stats.inserted}, Updated=${stats.updated}, Unchanged=${stats.unchanged}, Deleted=${stats.deleted}, Skipped=${stats.skipped}`
    );

    return { ok: true, calendarId, dryRun, stats, details };
  } catch (error: any) {
    const errorMessage = error?.response?.data?.error?.message || error.message || 'Errore sconosciuto.';
    await logSyncMessage(`[ODG SYNC FAILED] Error: ${errorMessage}`);
    return { ok: false, calendarId, dryRun, stats, details, error: errorMessage, where: 'odg-calendar-sync' };
  }
}
