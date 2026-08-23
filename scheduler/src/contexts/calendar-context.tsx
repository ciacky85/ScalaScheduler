'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import type { ImpostazioniCalendario } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

interface CalendarContextType {
  calendars: ImpostazioniCalendario[];
  addCalendar: (calendar: ImpostazioniCalendario) => void;
  updateCalendar: (calendar: ImpostazioniCalendario) => void;
  removeCalendar: (id: string) => void;
  setAsDefault: (id: string, tipo: 'importaCalendario' | 'odg') => void;
}

const CalendarContext = createContext<CalendarContextType | undefined>(
  undefined,
);

// --- Helper per SALVARE (scrivere il file) tramite POST /api/calendars (array) ---
async function saveCalendars(
  calendars: ImpostazioniCalendario[],
): Promise<boolean> {
  try {
    const response = await fetch('/api/calendars', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(calendars),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => undefined);
      console.error(
        '[CalendarProvider] Failed to save calendars:',
        errorData?.error,
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error('[CalendarProvider] Error while saving calendars:', error);
    return false;
  }
}

export function CalendarProvider({
  children,
  initialCalendars,
}: {
  children: ReactNode;
  initialCalendars: ImpostazioniCalendario[];
}) {
  const [calendars, setCalendars] =
    useState<ImpostazioniCalendario[]>(initialCalendars);
  const { toast } = useToast();

  // All'avvio ricarichiamo SEMPRE dal file tramite POST /api/calendars senza body
  useEffect(() => {
    async function loadCalendars() {
      try {
        const response = await fetch('/api/calendars', {
          method: 'POST',
        });

        if (!response.ok) {
          console.error(
            '[CalendarProvider] POST /api/calendars (load) returned status',
            response.status,
          );
          return;
        }

        const data = await response.json();
        if (data && Array.isArray(data.calendars)) {
          console.log(
            '[CalendarProvider] Loaded calendars from API (load):',
            data.calendars.map((c: ImpostazioniCalendario) => ({
              id: c.id,
              label: c.label,
              tipo: c.tipo,
              predefinito: c.predefinito,
            })),
          );
          setCalendars(data.calendars);
        } else {
          console.warn(
            '[CalendarProvider] POST /api/calendars (load): invalid payload',
            data,
          );
        }
      } catch (error) {
        console.error('[CalendarProvider] Error loading calendars:', error);
      }
    }

    loadCalendars();
  }, []);

  const handleSave = async (newCalendars: ImpostazioniCalendario[]) => {
    const previous = calendars;
    setCalendars(newCalendars);

    const success = await saveCalendars(newCalendars);
    if (success) {
      toast({
        title: 'Calendari salvati',
        description: 'La configurazione dei calendari è stata aggiornata.',
      });
    } else {
      toast({
        variant: 'destructive',
        title: 'Errore di salvataggio',
        description: 'Impossibile salvare le modifiche ai calendari.',
      });
      // Ripristino stato precedente
      setCalendars(previous);
    }
  };

  const addCalendar = (calendar: ImpostazioniCalendario) => {
    handleSave([...calendars, calendar]);
  };

  const updateCalendar = (calendar: ImpostazioniCalendario) => {
    handleSave(
      calendars.map((cal) => (cal.id === calendar.id ? calendar : cal)),
    );
  };

  const removeCalendar = (id: string) => {
    handleSave(calendars.filter((cal) => cal.id !== id));
  };

  const setAsDefault = (id: string, tipo: 'importaCalendario' | 'odg') => {
    const newCalendars = calendars.map((cal) => {
      if (cal.tipo === tipo) {
        return { ...cal, predefinito: cal.id === id };
      }
      return cal;
    });
    handleSave(newCalendars);
  };

  return (
    <CalendarContext.Provider
      value={{ calendars, addCalendar, updateCalendar, removeCalendar, setAsDefault }}
    >
      {children}
    </CalendarContext.Provider>
  );
}

export function useCalendars() {
  const context = useContext(CalendarContext);
  if (context === undefined) {
    throw new Error('useCalendars must be used within a CalendarProvider');
  }
  return context;
}
