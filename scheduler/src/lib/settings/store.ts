import type { AppSettings, ImpostazioniCalendario } from '@/lib/types';
// Rimuoviamo l'import del file JSON da qui, verrà gestito a un livello superiore
// import calendarConfig from '@/app/config/calendars.json';

const SETTINGS_KEY = 'chorus-calendar-sync-settings';

// I calendari non sono più parte delle impostazioni di default qui
const defaultSettings: Omit<AppSettings, 'calendari'> = {
  durataDefaultMin: 60,
  timezone: 'Europe/Rome',
  consentiDateFuoriMese: true,
  exportMode: 'serviceAccount',
};

// Carica solo le impostazioni che non sono i calendari
export function getSettings(): AppSettings {
  const baseSettings = { ...defaultSettings, calendari: [] };
  if (typeof window === 'undefined') {
    return baseSettings;
  }
  try {
    const storedSettings = localStorage.getItem(SETTINGS_KEY);
    if (storedSettings) {
      const parsed = JSON.parse(storedSettings);
      // Sovrascrive solo le impostazioni salvate, lasciando i calendari vuoti
      return { ...baseSettings, ...parsed, calendari: [] };
    }
  } catch (error) {
    console.error("Failed to load settings from localStorage", error);
  }
  return baseSettings;
}

// Salva solo le impostazioni che non sono i calendari
export function saveSettings(settings: Partial<AppSettings>): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    // Escludi esplicitamente i calendari dal salvataggio
    const { calendari, ...settingsToStore } = settings;
    const currentStored = localStorage.getItem(SETTINGS_KEY);
    const currentParsed = currentStored ? JSON.parse(currentStored) : {};
    
    const newSettingsToStore = { ...currentParsed, ...settingsToStore };

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettingsToStore));
  } catch (error) {
    console.error("Failed to save settings to localStorage", error);
  }
}
