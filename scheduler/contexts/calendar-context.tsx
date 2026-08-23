'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import type { ImpostazioniCalendario } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

interface CalendarContextType {
  calendars: ImpostazioniCalendario[];
  addCalendar: (calendar: ImpostazioniCalendario) => void;
  updateCalendar: (calendar: ImpostazioniCalendario) => void;
  removeCalendar: (id: string) => void;
  setAsDefault: (id: string, tipo: 'importaCalendario' | 'odg') => void;
}

const CalendarContext = createContext<CalendarContextType | undefined>(undefined);

// Funzione helper per salvare i calendari tramite API
async function saveCalendars(calendars: ImpostazioniCalendario[]): Promise<boolean> {
    try {
        const response = await fetch('/api/calendars', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(calendars),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Failed to save calendars:', errorData.error);
            return false;
        }
        return true;
    } catch (error) {
        console.error('Error calling save calendars API:', error);
        return false;
    }
}


export function CalendarProvider({ children, initialCalendars }: { children: ReactNode; initialCalendars: ImpostazioniCalendario[] }) {
  const [calendars, setCalendars] = useState<ImpostazioniCalendario[]>(initialCalendars);
  const { toast } = useToast();

  const handleSave = async (newCalendars: ImpostazioniCalendario[]) => {
      setCalendars(newCalendars);
      const success = await saveCalendars(newCalendars);
      if (success) {
          toast({ title: 'Calendari salvati', description: 'La configurazione dei calendari è stata aggiornata.' });
      } else {
          toast({ variant: 'destructive', title: 'Errore di salvataggio', description: 'Impossibile salvare le modifiche ai calendari.' });
          // Opzionale: ripristinare lo stato precedente in caso di errore
          setCalendars(calendars); 
      }
  };

  const addCalendar = (calendar: ImpostazioniCalendario) => {
    handleSave([...calendars, calendar]);
  };

  const updateCalendar = (updatedCalendar: ImpostazioniCalendario) => {
    handleSave(calendars.map(cal => (cal.id === updatedCalendar.id ? updatedCalendar : cal)));
  };

  const removeCalendar = (id: string) => {
    handleSave(calendars.filter(cal => cal.id !== id));
  };

  const setAsDefault = (id: string, tipo: 'importaCalendario' | 'odg') => {
      const newCalendars = calendars.map(cal => {
          if (cal.tipo === tipo) {
              return { ...cal, predefinito: cal.id === id };
          }
          return cal;
      });
      handleSave(newCalendars);
  }

  return (
    <CalendarContext.Provider value={{ calendars, addCalendar, updateCalendar, removeCalendar, setAsDefault }}>
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
