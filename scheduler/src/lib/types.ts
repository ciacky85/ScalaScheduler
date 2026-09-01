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

export interface ScraperConfig {
  urls: string[];
  output_file: string;
  schedules: string[];
  run_on_start: boolean;
}

export interface ScraperStatus {
  lastGeneratedAt: string | null;
  pageCount: number;
  totalRows: number;
  pages: Array<{
    url: string;
    dateLabel: string | null;
    dateIso: string | null;
    lastUpdateRaw: string | null;
    rowCount: number;
  }>;
  configFileFound: boolean;
  configPath: string;
  dataFileFound: boolean;
  dataPath: string;
}

export type UserRole = 'admin' | 'user';
export type UserStatus = 'pending' | 'approved' | 'rejected' | 'disabled';

export interface User {
  id: string;                    // UUID
  username: string;              // Username univoco
  nome: string;                  // Nome e Cognome
  email?: string;
  passwordHash: string;          // Password cifrata
  salt: string;
  role: UserRole;                // 'admin' | 'user'
  status: UserStatus;            // 'pending' | 'approved' | 'rejected' | 'disabled'
  assignedCalendarIds: string[]; // ID Google Calendar assegnati
  createdAt: string;             // ISO Date
  approvedAt?: string;
  approvedBy?: string;
  lastLoginAt?: string;
}

export interface UserProfile {
  id: string;
  username: string;
  nome: string;
  email?: string;
  role: UserRole;
  status: UserStatus;
  assignedCalendarIds: string[];
  createdAt: string;
  approvedAt?: string;
  lastLoginAt?: string;
}

export interface UserSession {
  userId: string;
  username: string;
  nome: string;
  role: UserRole;
  assignedCalendarIds: string[];
  expiresAt: number; // timestamp ms
}


