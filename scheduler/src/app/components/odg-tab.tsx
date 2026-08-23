'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useCalendars } from '@/contexts/calendar-context';
import { Loader2, RefreshCw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';


// --- Local Types from Schema ---
interface ODGRowData {
  recipient: { raw: string | null; normalized: string | null };
  place: { raw: string | null; normalized: string | null };
  time: { raw: string | null; start: string | null; end: string | null };
  description: { raw: string | null; title: string | null; details: string[] };
}
interface ODGPage {
  source_url: string;
  date: { label: string | null; iso: string | null };
  last_update: { raw: string | null; iso: string | null };
  table: { rows: ODGRowData[] };
  stats: { row_count: number };
}
interface ODGPayload {
  export_generated_at: string;
  pages: ODGPage[];
}
interface SyncStats {
    scanned: number;
    inserted: number;
    updated: number;
    unchanged: number;
    deleted: number;
    skipped: number;
}


export default function OdgTab() {
  const { toast } = useToast();
  const { calendars } = useCalendars();
  const [targetCalendarId, setTargetCalendarId] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [odgData, setOdgData] = useState<ODGPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<{stats: SyncStats, details: any[], dryRun: boolean} | null>(null);
  const [isDryRun, setIsDryRun] = useState(false);

  const availableCalendars = calendars.filter(c => c.tipo === 'odg');

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/odg_structured.json', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: ODGPayload = await response.json();
      setOdgData(data);
    } catch (e: any) {
      setError(`Impossibile caricare i dati dell'ODG: ${e.message}`);
      toast({
        variant: 'destructive',
        title: 'Errore di Caricamento',
        description: `Impossibile recuperare il file odg_structured.json. ${e.message}`,
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  // Set default calendar
  useEffect(() => {
    const defaultCalendar = availableCalendars.find(c => c.predefinito);
    if (defaultCalendar) {
        setTargetCalendarId(defaultCalendar.calendarId);
    }
  }, [availableCalendars])

  const handleExport = async () => {
    if (!targetCalendarId) {
      toast({ variant: 'destructive', title: 'Errore', description: 'Seleziona un calendario di destinazione.' });
      return;
    }
    
    setIsExporting(true);
    setLastSyncResult(null);
    try {
        const res = await fetch("/api/odg/push", { 
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                dryRun: isDryRun,
                calendarId: targetCalendarId 
            })
        });
        
        const data = await res.json();

        if (!res.ok || !data.ok) {
            throw new Error(data.error || 'Errore sconosciuto dal server');
        }

        setLastSyncResult(data);

        toast({
            title: `Push Completato ${isDryRun ? '(Dry Run)' : ''}`,
            description: `${data.stats.inserted} inseriti, ${data.stats.updated} aggiornati, ${data.stats.deleted} rimossi, ${data.stats.skipped} saltati.`,
        });

    } catch (e: any) {
        toast({
            variant: "destructive",
            title: "Errore durante il Push",
            description: e.message || "Si è verificato un errore sconosciuto.",
        });
    } finally {
        setIsExporting(false);
    }
  };

  const isExportDisabled = !targetCalendarId || isExporting || !odgData || odgData.pages.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>ODG (Ordine del Giorno)</CardTitle>
        <div className="flex justify-between items-center">
            <CardDescription>
            {odgData ? (
                `Ultimo export file: ${format(parseISO(odgData.export_generated_at), "dd/MM/yyyy 'alle' HH:mm:ss", { locale: it })}`
            ) : (
                'Visualizzazione degli ordini del giorno più recenti.'
            )}
            </CardDescription>
            <Button onClick={fetchData} variant="outline" size="sm" disabled={isLoading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Ricarica
            </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        
        <div className="flex flex-wrap items-center gap-4 p-4 bg-muted/50 rounded-lg">
             <div className="flex-grow flex items-center gap-2">
                <Select onValueChange={setTargetCalendarId} value={targetCalendarId} disabled={availableCalendars.length === 0}>
                    <SelectTrigger className="w-[280px]" aria-label="Seleziona calendario ODG di destinazione">
                        <SelectValue placeholder="Seleziona calendario Google ODG" />
                    </SelectTrigger>
                    <SelectContent>
                        {availableCalendars.map(cal => (
                            <SelectItem key={cal.id} value={cal.calendarId}>
                                {cal.label}
                            </SelectItem>
                        ))}
                        {availableCalendars.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nessun calendario ODG configurato.</p>}
                    </SelectContent>
                </Select>
                <Button onClick={handleExport} disabled={isExportDisabled}>
                    {isExporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Push su Google Calendar
                </Button>
            </div>
             <div className="flex items-center space-x-2">
                <input type="checkbox" id="dryRunCheck" checked={isDryRun} onChange={(e) => setIsDryRun(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
                <label htmlFor="dryRunCheck" className="text-sm font-medium text-gray-700">
                    Dry Run (Simula solo, non esegue modifiche)
                </label>
            </div>
        </div>
        
        {lastSyncResult && (
            <Card>
                <CardHeader>
                    <CardTitle>Risultato Ultimo Push {lastSyncResult.dryRun ? '(Dry Run)' : ''}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="font-mono text-sm">
                        <p>Scansionati: {lastSyncResult.stats.scanned}</p>
                        <p className="text-green-600">Inseriti: {lastSyncResult.stats.inserted}</p>
                        <p className="text-blue-600">Aggiornati: {lastSyncResult.stats.updated}</p>
                        <p className="text-gray-500">Invariati: {lastSyncResult.stats.unchanged}</p>
                        <p className="text-red-600">Rimossi: {lastSyncResult.stats.deleted}</p>
                        <p className="text-yellow-600">Saltati: {lastSyncResult.stats.skipped}</p>
                    </div>
                </CardContent>
            </Card>
        )}

        {isLoading && <div className="text-center p-8">Caricamento dati in corso...</div>}
        {error && <div className="text-center p-8 text-destructive">{error}</div>}

        <div className="space-y-8">
          {odgData?.pages.map((page, pageIndex) => (
            <div key={page.source_url || pageIndex}>
              <div className="flex justify-between items-baseline mb-2">
                  <h3 className="text-lg font-semibold font-headline">
                      Ordine del Giorno {page.date?.label || (page.date?.iso ? format(parseISO(page.date.iso), 'dd/MM/yyyy') : 'Data N/D')}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                      Agg. Pagina Scala: {page.last_update?.raw || 'N/D'}
                  </p>
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[25%]">Destinatario</TableHead>
                      <TableHead className="w-[15%]">Luogo</TableHead>
                      <TableHead className="w-[15%]">Fascia oraria</TableHead>
                      <TableHead className="w-[45%]">Descrizione</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {page.table.rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                          Nessun evento
                        </TableCell>
                      </TableRow>
                    ) : (
                      page.table.rows.map((row, rowIndex) => {
                        const timeDisplay = (row.time.start && row.time.end)
                          ? `${row.time.start} - ${row.time.end}`
                          : row.time.raw || '';
                        
                        return (
                          <TableRow key={rowIndex}>
                            <TableCell>{row.recipient.raw || ''}</TableCell>
                            <TableCell>{row.place.raw || ''}</TableCell>
                            <TableCell className="font-code">{timeDisplay}</TableCell>
                            <TableCell>{row.description.raw || ''}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-between items-center mt-2 text-xs text-muted-foreground">
                <a href={page.source_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    Fonte: {page.source_url}
                </a>
                <span>Righe: {page.table.rows.length}</span>
              </div>
            </div>
          ))}
          {!isLoading && !error && odgData?.pages.length === 0 && (
            <p className="text-muted-foreground p-4 text-center">Nessun dato da visualizzare.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
