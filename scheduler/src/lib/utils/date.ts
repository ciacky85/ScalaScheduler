import { format, parse } from 'date-fns';
import { it } from 'date-fns/locale';
import { TIMEZONE } from '../constants';

const DATE_FORMAT = 'dd/MM/yyyy';

/**
 * Parses a date string in "dd/MM/yyyy" format.
 * @param dateString The date string to parse.
 * @returns A Date object.
 */
export function parseDate(dateString: string): Date {
  return parse(dateString, DATE_FORMAT, new Date());
}

/**
 * Formats a Date object into a "dd/MM/yyyy" string.
 * @param date The Date object to format.
 * @returns A formatted date string.
 */
export function formatDate(date: Date): string {
  return format(date, DATE_FORMAT, { locale: it });
}

/**
 * Combines a date string and a time string into a full ISO string in the app's timezone.
 * @param dateStr Date in "dd/MM/yyyy" format.
 * @param timeStr Time in "HH:mm" format.
 * @returns A full ISO 8601 date-time string.
 */
export function createDateTimeISO(dateStr: string, timeStr: string): string {
    // This is a simplified version. For full accuracy across timezones and DST,
    // a library like date-fns-tz would be better.
    const [day, month, year] = dateStr.split('/');
    const [hours, minutes] = timeStr.split(':');
    
    // Format to YYYY-MM-DDTHH:mm:ss
    const isoString = `${year}-${month}-${day}T${hours}:${minutes}:00`;
    
    // While the client's Date constructor will use the system's timezone,
    // Google Calendar API expects an explicit timezone for correctness.
    // The export function will specify 'Europe/Rome'.
    return isoString;
}
