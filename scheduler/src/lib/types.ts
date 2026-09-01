// Tipi base
export type Orario = string; // Formato "HH:mm"

export interface RigaCalendario {
  id: string; // uuid
  selected: boolean; // checkbox
  giornoSettimanale: string; // "Lunedì" ...
  data: string; // "dd/MM/yyyy"
  descrizione: string;
  dettaglio: string;
  luogo: string;
  fascia1Start?: Orario; // "HH:mm"
  fascia1End?: Orario; // "HH:mm"
  fascia2Start?: Orario; // "HH:mm"
  fascia2End?: Orario; // "HH:mm"
  stato?: 'ok' | 'da_revisionare';
  rawText?: string;
}

export interface ImpostazioniCalendario {
  id: string; // uuid interno
  label: string; // nome visualizzato
  calendarId: string; // id effettivo Google Calendar
  tipo: 'importaCalendario' | 'odg';
  predefinito?: boolean;
}

export interface AppSettings {
  calendari: ImpostazioniCalendario[];
  durataDefaultMin: number; // per slot con solo start
  timezone: 'Europe/Rome';
  consentiDateFuoriMese: boolean;
  exportMode: 'oauth' | 'serviceAccount';
  // Configurazione Google Drive Screenshot (Amministratore)
  googleDriveFolderUrl?: string; // Link o ID cartella Google Drive
  salvaAncheInLocale?: boolean;  // Se true salva anche in locale, altrimenti solo su Drive
}

