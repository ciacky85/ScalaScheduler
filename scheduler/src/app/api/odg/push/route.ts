// src/app/api/odg/push/route.ts
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { getServiceAccount } from '@/lib/drive/google-drive';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { add, format, parseISO, startOfDay, endOfDay } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

// --- Type Definitions ---
interface ODGRowData {
  row_index: number;
  recipient: { raw: string | null; normalized: string | null; category: string | null };
  place: { raw: string | null; normalized: string | null; location_type: string | null };
  time: { raw: string | null; start: string | null; end: string | null; tz: string | null };
  description: { raw: string | null; title: string | null; details: string[]; flags: string[] };
  // opzionali/non tipizzati nel JSON ma a volte presenti:
  provenance?: { tokens?: string[] };
  raw_line?: string | null;
}
interface ODGPage {
  source_url: string;
  date: { label: string | null; iso: string | null };
  last_update: { raw: string | null; iso: string | null };
  table: { rows: ODGRowData[] };
}
interface ODGPayload {
  export_generated_at: string;
  pages: ODGPage[];
}
interface SyncStats {
  scanned: number;
  inserted: number;
  updated: number;
  unchanged: number;
  deleted: number;
  skipped: number;
}
interface DetailLog {
  odg_uid: string;
  date: string;
  action: 'insert' | 'update' | 'skip' | 'delete';
  reason: string;
}

// --- Constants ---
const TIMEZONE = 'Europe/Rome';
const DEFAULT_DURATION_MIN = 90;
const LOG_FILE_PATH = path.join(process.cwd(), 'public', 'odg_sync.log');

// Regex robuste (accettano -, – e — come separatori)
const RANGE_RE = /\b([01]?\d|2[0-3]):([0-5]\d)\s*[-–—]\s*([01]?\d|2[0-3]):([0-5]\d)\b/;
const TIME_RE = /\b([01]?\d|2[0-3]):([0-5]\d)\b/;

// --- Helper Functions ---
const log = async (message: string) => {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message}\n`;
  try {
    await fs.appendFile(LOG_FILE_PATH, logMessage, 'utf-8');
  } catch (error) {
    console.error('Failed to write to log file:', error);
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
const normalizeForUid = (s: string | null | undefined) =>
  (s ?? '').trim().toUpperCase().replace(/\s+/g, ' ');

/**
 * Cerca orari in vari campi (priorità: strutturati → raw → descrizione → title → details → concatenato → provenance → raw_line).
 * Torna sempre il primo match affidabile trovato.
 */
function getEventTimes(row: ODGRowData): { start: string | null; end: string | null; where: string } {
  // 1) campi strutturati
  if (row.time?.start) {
    return { start: row.time.start, end: row.time?.end ?? null, where: 'structured' };
  }

  // 2) row.time.raw (cerca ovunque, non solo match completo)
  if (row.time?.raw) {
    const raw = String(row.time.raw);
    const r = raw.match(RANGE_RE);
    if (r) return { start: `${r[1]}:${r[2]}`, end: `${r[3]}:${r[4]}`, where: 'time.raw:range' };
    const s = raw.match(TIME_RE);
    if (s) return { start: `${s[1]}:${s[2]}`, end: null, where: 'time.raw:single' };
  }

  // 3) description.raw
  if (row.description?.raw) {
    const desc = String(row.description.raw);
    const r = desc.match(RANGE_RE);
    if (r) return { start: `${r[1]}:${r[2]}`, end: `${r[3]}:${r[4]}`, where: 'desc.raw:range' };
    const s = desc.match(TIME_RE);
    if (s) return { start: `${s[1]}:${s[2]}`, end: null, where: 'desc.raw:single' };
  }

  // 4) description.title
  if (row.description?.title) {
    const t = String(row.description.title);
    const r = t.match(RANGE_RE);
    if (r) return { start: `${r[1]}:${r[2]}`, end: `${r[3]}:${r[4]}`, where: 'desc.title:range' };
    const s = t.match(TIME_RE);
    if (s) return { start: `${s[1]}:${s[2]}`, end: null, where: 'desc.title:single' };
  }

  // 5) description.details (unisci e cerca)
  if (row.description?.details?.length) {
    const djoin = row.description.details.join(' | ');
    const r = djoin.match(RANGE_RE);
    if (r) return { start: `${r[1]}:${r[2]}`, end: `${r[3]}:${r[4]}`, where: 'desc.details:range' };
    const s = djoin.match(TIME_RE);
    if (s) return { start: `${s[1]}:${s[2]}`, end: null, where: 'desc.details:single' };
  }

  // 6) concatenazione di recipient/place/description (nel caso l’orario sia finito lì)
  {
    const concat = [
      row.recipient?.raw ?? '',
      row.place?.raw ?? '',
      row.description?.raw ?? '',
    ].join(' | ');
    const r = concat.match(RANGE_RE);
    if (r) return { start: `${r[1]}:${r[2]}`, end: `${r[3]}:${r[4]}`, where: 'concat:range' };
    const s = concat.match(TIME_RE);
    if (s) return { start: `${s[1]}:${s[2]}`, end: null, where: 'concat:single' };
  }

  // 7) provenance.tokens (se presenti nello scraper)
  const tokens = (row as any)?.provenance?.tokens as string[] | undefined;
  if (tokens?.length) {
    const joined = tokens.join(' | ');
    const r = joined.match(RANGE_RE);
    if (r) return { start: `${r[1]}:${r[2]}`, end: `${r[3]}:${r[4]}`, where: 'tokens:range' };
    const s = joined.match(TIME_RE);
    if (s) return { start: `${s[1]}:${s[2]}`, end: null, where: 'tokens:single' };
  }

  // 8) raw_line (alcune versioni del parser la espongono)
  if ((row as any)?.raw_line) {
    const rl = String((row as any).raw_line);
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

async function runSync(
  calendarId: string,
  dryRun: boolean = false
): Promise<{ ok: boolean; stats: SyncStats; details: DetailLog[]; error?: string; where?: string }> {
  const stats: SyncStats = { scanned: 0, inserted: 0, updated: 0, unchanged: 0, deleted: 0, skipped: 0 };
  const details: DetailLog[] = [];

  try {
    await log(`[SYNC START] Calendar ID: ${calendarId}, Dry Run: ${dryRun}`);

    const filePath = path.join(process.cwd(), 'public', 'odg_structured.json');
    const fileContent = readFileSync(filePath, 'utf-8');
    const payload: ODGPayload = JSON.parse(fileContent);

    const auth = createAuth();
    const calendar = google.calendar({ version: 'v3', auth });

    const sourceEvents = new Map<string, any>();
    const datesToSync = new Set<string>();

    for (const page of payload.pages) {
      if (!page.date?.iso) continue;
      const eventDate = page.date.iso;
      datesToSync.add(eventDate);

      for (const row of page.table.rows) {
        stats.scanned++;

        const { start: rawStart, end: rawEnd, where } = getEventTimes(row);

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

        // summary compatto ma informativo
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

    // Recupera eventi esistenti per le date da sincronizzare
    const existingEvents = new Map<string, any>();
    for (const date of datesToSync) {
      const timeMin = startOfDay(parseISO(date)).toISOString();
      const timeMax = endOfDay(parseISO(date)).toISOString();

      const res = await calendar.events.list({
        calendarId,
        timeMin,
        timeMax,
        maxResults: 250,
        showDeleted: false,
        singleEvents: true,
      });

      res.data.items?.forEach((event) => {
        const uid = event.extendedProperties?.private?.odg_uid;
        if (uid) {
          if (existingEvents.has(uid)) {
            // Duplicato: cancella gli extra
            stats.deleted++;
            details.push({ odg_uid: uid, date, action: 'delete', reason: 'duplicate uid found' });
            if (!dryRun && event.id) {
              calendar.events
                .delete({ calendarId, eventId: event.id })
                .catch((e) => log(`ERROR: Failed to delete duplicate event ${event.id}: ${e.message}`));
            }
          } else {
            existingEvents.set(uid, event);
          }
        }
      });
    }

    // Upsert (insert/update/skip)
    for (const [uid, eventData] of sourceEvents.entries()) {
      const existingEvent = existingEvents.get(uid);

      if (!existingEvent) {
        stats.inserted++;
        const logDetail = {
          odg_uid: uid,
          date: eventData.extendedProperties.private.odg_date_iso,
          action: 'insert' as const,
          reason: 'new event',
        };
        details.push(logDetail);
        await log(`  - [INSERT] ${uid} (Date: ${logDetail.date}): New event.`);
        if (!dryRun) {
          await calendar.events.insert({ calendarId, requestBody: eventData });
        }
      } else {
        const existingHash = existingEvent.extendedProperties?.private?.odg_content_hash;
        const newHash = eventData.extendedProperties.private.odg_content_hash;

        if (existingHash !== newHash) {
          stats.updated++;
          const logDetail = {
            odg_uid: uid,
            date: eventData.extendedProperties.private.odg_date_iso,
            action: 'update' as const,
            reason: 'content changed',
          };
          details.push(logDetail);
          await log(`  - [UPDATE] ${uid} (Date: ${logDetail.date}): Content changed.`);
          if (!dryRun && existingEvent.id) {
            await calendar.events.update({
              calendarId,
              eventId: existingEvent.id,
              requestBody: eventData,
            });
          }
        } else {
          stats.unchanged++;
          const logDetail = {
            odg_uid: uid,
            date: eventData.extendedProperties.private.odg_date_iso,
            action: 'skip' as const,
            reason: 'content unchanged',
          };
          details.push(logDetail);
        }
        existingEvents.delete(uid);
      }
    }

    // Cancella residui non più presenti in sorgente
    for (const [uid, eventToDelete] of existingEvents.entries()) {
      stats.deleted++;
      const dateToDelete = eventToDelete.extendedProperties?.private?.odg_date_iso || 'unknown';
      const logDetail = { odg_uid: uid, date: dateToDelete, action: 'delete' as const, reason: 'event not in source' };
      details.push(logDetail);
      await log(`  - [DELETE] ${uid} (Date: ${dateToDelete}): Event not in source.`);
      if (!dryRun && eventToDelete.id) {
        await calendar.events.delete({ calendarId, eventId: eventToDelete.id });
      }
    }

    await log(
      `[SYNC END] Summary: Scanned=${stats.scanned}, Inserted=${stats.inserted}, Updated=${stats.updated}, Unchanged=${stats.unchanged}, Deleted=${stats.deleted}, Skipped=${stats.skipped}`
    );
    return { ok: true, stats, details };
  } catch (error: any) {
    const errorMessage = error?.response?.data?.error?.message || error.message || 'An unknown error occurred.';
    await log(`[SYNC FAILED] Error: ${errorMessage}`);
    return { ok: false, stats, details, error: errorMessage, where: 'push-sync' };
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { calendarId, dryRun = false } = body;

    if (!calendarId) {
      return NextResponse.json({ ok: false, error: 'calendarId is required.' }, { status: 400 });
    }

    const result = await runSync(calendarId, dryRun);

    if (result.ok) {
      return NextResponse.json({ ...result, dryRun });
    } else {
      return NextResponse.json({ ok: false, error: result.error, where: result.where }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Fatal API Error in /api/odg/push:', error);
    await log(`[FATAL ERROR] Push job failed unexpectedly: ${error.message}`);
    return NextResponse.json(
      { ok: false, error: 'A fatal, unexpected error occurred in the push handler.' },
      { status: 500 }
    );
  }
}
