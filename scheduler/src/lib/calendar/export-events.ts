'use server';

import type { RigaCalendario, AppSettings } from '@/lib/types';
import { generateExportErrorReport } from '@/ai/flows/generate-export-error-report';
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { getServiceAccount } from '@/lib/drive/google-drive';
import { add, format, parse as parseDateFns } from 'date-fns';

interface ExportResult {
  success: boolean;
  eventsCreated?: number;
  report?: string | null;
  error?: string;
}

const createAuth = () => {
  const sa = getServiceAccount();
  return new JWT({
    email: sa.client_email || '',
    key: sa.private_key || '',
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
};

function formatToRFC3339(dateStr: string, timeStr: string): string | null {
    try {
        const [day, month, year] = dateStr.split('/');
        const [hours, minutes] = timeStr.split(':');
        // Formato YYYY-MM-DDTHH:mm:ss
        return `${year}-${month}-${day}T${hours}:${minutes}:00`;
    } catch(e) {
        console.error(`Error formatting date/time: ${dateStr} ${timeStr}`, e);
        return null;
    }
}


export async function exportEventsToGoogleCalendar(
  rows: RigaCalendario[],
  calendarId: string,
  settings: AppSettings
): Promise<ExportResult> {
  
  const auth = createAuth();
  const calendar = google.calendar({ version: 'v3', auth });

  const errors: string[] = [];
  let eventsCreated = 0;

  for (const row of rows) {
      // Se non ci sono orari, crea un evento per tutto il giorno
      if (!row.fascia1Start && !row.fascia2Start) {
          try {
              const eventDate = parseDateFns(row.data, 'dd/MM/yyyy', new Date());
              const event = {
                  summary: `${row.descrizione}${row.dettaglio ? ` - ${row.dettaglio}` : ''}`,
                  location: row.luogo,
                  description: `Evento importato da Chorus Calendar Sync.\nRiga sorgente: ${row.giornoSettimanale} ${row.data}\nTesto Originale: ${row.rawText || 'N/A'}`,
                  start: {
                      date: format(eventDate, 'yyyy-MM-dd'),
                  },
                  end: {
                      date: format(eventDate, 'yyyy-MM-dd'),
                  },
              };

              await calendar.events.insert({
                  calendarId: calendarId,
                  requestBody: event,
              });
              eventsCreated++;
          } catch (e: any) {
              console.error('Google Calendar API error (all-day):', e);
              const apiError = e.response?.data?.error;
              let errorMessage = `Evento "tutto il giorno" (${row.data}): Impossibile creare l'evento.`;
              if (apiError) {
                  errorMessage += ` Dettaglio API: ${apiError.message} (codice: ${apiError.code}).`;
                  if (apiError.code === 404) {
                      const sa = getServiceAccount();
                      errorMessage += ` Controlla che l'ID del calendario sia corretto e che l'email del service account (${sa.client_email || 'Service Account'}) sia stata invitata a gestire gli eventi su quel calendario.`;
                  }
              } else {
                  errorMessage += ` ${e.message}`;
              }
              errors.push(errorMessage);
          }
          continue; // Passa alla riga successiva
      }


      const processFascia = async (fasciaStart?: string, fasciaEnd?: string) => {
          if (!fasciaStart) return;

          const startDateTime = formatToRFC3339(row.data, fasciaStart);
          if (!startDateTime) {
              errors.push(`Riga ${row.id}: orario di inizio "${fasciaStart}" non valido.`);
              return;
          }

          let endDateTime: string;
          if (fasciaEnd) {
              const parsedEnd = formatToRFC3339(row.data, fasciaEnd);
              if (parsedEnd) {
                  endDateTime = parsedEnd;
              } else {
                  errors.push(`Riga ${row.id}: orario di fine "${fasciaEnd}" non valido. Verrà usata la durata di default.`);
                  const startDate = parseDateFns(`${row.data} ${fasciaStart}`, 'dd/MM/yyyy HH:mm', new Date());
                  const endDate = add(startDate, { minutes: settings.durataDefaultMin });
                  endDateTime = format(endDate, "yyyy-MM-dd'T'HH:mm:ss");
              }
          } else {
              const startDate = parseDateFns(`${row.data} ${fasciaStart}`, 'dd/MM/yyyy HH:mm', new Date());
              const endDate = add(startDate, { minutes: settings.durataDefaultMin });
              endDateTime = format(endDate, "yyyy-MM-dd'T'HH:mm:ss");
          }

          const event = {
            summary: `${row.descrizione}${row.dettaglio ? ` - ${row.dettaglio}` : ''}`,
            location: row.luogo,
            description: `Evento importato da Chorus Calendar Sync.\nRiga sorgente: ${row.giornoSettimanale} ${row.data}\nTesto Originale: ${row.rawText || 'N/A'}`,
            start: {
              dateTime: startDateTime,
              timeZone: settings.timezone,
            },
            end: {
              dateTime: endDateTime,
              timeZone: settings.timezone,
            },
          };

          try {
              await calendar.events.insert({
                  calendarId: calendarId,
                  requestBody: event,
              });
              eventsCreated++;
          } catch (e: any) {
              console.error('Google Calendar API error:', e);
              const apiError = e.response?.data?.error;
              let errorMessage = `Evento "${event.summary}" (${row.data}): Impossibile creare l'evento.`;
              if (apiError) {
                  errorMessage += ` Dettaglio API: ${apiError.message} (codice: ${apiError.code}).`;
                  if (apiError.code === 404) {
                      const sa = getServiceAccount();
                      errorMessage += ` Controlla che l'ID del calendario sia corretto e che l'email del service account (${sa.client_email || 'Service Account'}) sia stata invitata a gestire gli eventi su quel calendario.`;
                  }
              } else {
                  errorMessage += ` ${e.message}`;
              }
              errors.push(errorMessage);
          }
      };

      await processFascia(row.fascia1Start, row.fascia1End);
      await processFascia(row.fascia2Start, row.fascia2End);
  }

  if (errors.length > 0) {
    try {
      const report = await generateExportErrorReport(errors);
      return { success: false, report, eventsCreated };
    } catch (e) {
      console.error("Failed to generate error report:", e);
      return { success: false, error: 'Failed to generate AI error report. Raw errors: ' + errors.join(', '), eventsCreated };
    }
  }

  return { success: true, eventsCreated };
}
