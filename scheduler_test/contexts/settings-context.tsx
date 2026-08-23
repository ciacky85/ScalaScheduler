'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { AppSettings } from '@/lib/types';
import { getSettings, saveSettings } from '@/lib/settings/store';

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
      {children}
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
