'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { AppSettings, ImpostazioniCalendario } from '@/lib/types';
import { getSettings, saveSettings } from '@/lib/settings/store';
import calendarConfig from '@/app/config/calendars.json';
import { CalendarProvider } from './calendar-context';

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  isLoaded: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<AppSettings>(() => {
    // Carica le impostazioni non-calendario e inizializza i calendari come array vuoto
    const baseSettings = getSettings();
    return { ...baseSettings, calendari: [] };
  });
  const [isLoaded, setIsLoaded] = useState(false);
  const [initialCalendars] = useState<ImpostazioniCalendario[]>(() => [
      ...calendarConfig.importaCalendario,
      ...calendarConfig.odg
    ]);


  useEffect(() => {
    // Al caricamento, le impostazioni sono già state inizializzate nel useState
    setIsLoaded(true);
  }, []);

  const updateSettings = (newSettings: Partial<AppSettings>) => {
    setSettingsState(prevSettings => {
      const updated = { ...prevSettings, ...newSettings };
      saveSettings(updated); // Salva solo le impostazioni non relative ai calendari
      return updated;
    });
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, isLoaded }}>
      <CalendarProvider initialCalendars={initialCalendars}>
        {children}
      </CalendarProvider>
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
