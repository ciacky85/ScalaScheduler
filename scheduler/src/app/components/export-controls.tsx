'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSettings } from '@/contexts/settings-context';
import { useCalendars } from '@/contexts/calendar-context';
import { useAuth } from '@/contexts/auth-context';
import type { RigaCalendario } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { exportEventsToGoogleCalendar } from '@/lib/calendar/export-events';
import { Loader2 } from 'lucide-react';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction } from '@/components/ui/alert-dialog';


interface ExportControlsProps {
  selectedRows: RigaCalendario[];
  tipo: 'importaCalendario' | 'odg';
}

export default function ExportControls({ selectedRows, tipo }: ExportControlsProps) {
  const { settings } = useSettings();
  const { calendars } = useCalendars();
  const { user, isAdmin, isCalendarAllowed } = useAuth();
  const { toast } = useToast();
  const [targetCalendarId, setTargetCalendarId] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [errorReport, setErrorReport] = useState<string | null>(null);

  const availableCalendars = (calendars || [])
    .filter(c => c && c.tipo === tipo)
    .filter(c => !user || isAdmin || isCalendarAllowed(c));

  const countEvents = () => {
    return selectedRows.reduce((acc, row) => {
        if(row.fascia1Start) acc++;
        if(row.fascia2Start) acc++;
        // Conta anche gli eventi "all-day"
        if (!row.fascia1Start && !row.fascia2Start && row.descrizione) acc++;
        return acc;
    }, 0);
  }

  const handleExport = async () => {
    setIsExporting(true);
    const result = await exportEventsToGoogleCalendar(selectedRows, targetCalendarId, settings);
    setIsExporting(false);

    if (result.success) {
      toast({
        title: 'Esportazione Completata',
        description: `${result.eventsCreated} eventi creati con successo nel calendario.`,
      });
    } else {
        if (result.report) {
            setErrorReport(result.report);
        } else {
            toast({
                variant: 'destructive',
                title: 'Errore di Esportazione',
                description: result.error || "Si è verificato un errore sconosciuto.",
            });
        }
    }
  };
  
  const isExportDisabled = selectedRows.length === 0 || !targetCalendarId || isExporting;

  return (
    <div className="flex flex-wrap items-center gap-4 p-4 bg-muted/50 rounded-lg">
      <p className="text-sm text-muted-foreground">
        {selectedRows.length} righe selezionate ({countEvents()} eventi)
      </p>
      <div className="flex-grow flex items-center gap-2">
        <Select
          onValueChange={setTargetCalendarId}
          disabled={selectedRows.length === 0}
          value={targetCalendarId}
        >
          <SelectTrigger className="w-[280px]" aria-label="Seleziona calendario di destinazione">
            <SelectValue placeholder="Seleziona calendario Google" />
          </SelectTrigger>
          <SelectContent>
            {availableCalendars.map(cal => (
              <SelectItem key={cal.id} value={cal.calendarId}>
                {cal.label}
              </SelectItem>
            ))}
            {availableCalendars.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nessun calendario configurato.</p>}
          </SelectContent>
        </Select>
        <Button onClick={handleExport} disabled={isExportDisabled}>
          {isExporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Esporta su Google Calendar
        </Button>
      </div>
        <AlertDialog open={!!errorReport} onOpenChange={() => setErrorReport(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Rapporto Errori Esportazione</AlertDialogTitle>
                <AlertDialogDescription className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap font-code">
                   {errorReport}
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogAction onClick={() => setErrorReport(null)}>Chiudi</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </div>
  );
}
