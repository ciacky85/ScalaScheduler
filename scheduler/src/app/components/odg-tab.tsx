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
  recipient?: { raw?: string | null; normalized?: string | null };
  place?: { raw?: string | null; normalized?: string | null };
  time?: { raw?: string | null; start?: string | null; end?: string | null };
  description?: { raw?: string | null; title?: string | null; details?: string[] };
}

interface ODGPage {
  source_url?: string;
  date?: { label?: string | null; iso?: string | null };
  last_update?: { raw?: string | null; iso?: string | null };
  table?: { rows?: ODGRowData[] };
  stats?: { row_count?: number };
}

interface ODGPayload {
  export_generated_at?: string;
  pages?: ODGPage[];
}

interface SyncStats {
  scanned: number;
  inserted: number;
  updated: number;
  unchanged: number;
  deleted: number;
  skipped: number;
}

function safeFormatDate(isoStr?: string | null, fmt = "dd/MM/yyyy 'alle' HH:mm:ss"): string {
  if (!isoStr) return 'N/D';
  try {
    const d = parseISO(isoStr);
    if (isNaN(d.getTime())) {
      const fallback = new Date(isoStr);
      if (!isNaN(fallback.getTime())) {
        return format(fallback, fmt, { locale: it });
      }
      return String(isoStr);
    }
    return format(d, fmt, { locale: it });
  } catch {
    return String(isoStr);
  }
}

export default function OdgTab() {
  const [isMounted, setIsMounted] = useState(false);
  const { toast } = useToast();
  const { calendars } = useCalendars();
  const [targetCalendarId, setTargetCalendarId] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [odgData, setOdgData] = useState<ODGPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<{ stats: SyncStats; details: any[]; dryRun: boolean } | null>(null);
  const [isDryRun, setIsDryRun] = useState(false);

  const availableCalendars = (calendars || []).filter(c => c && c.tipo === 'odg');

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/odg_structured.json', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data: ODGPayload = await response.json();
      setOdgData(data || { pages: [] });
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
    setIsMounted(true);
    fetchData();
  }, [fetchData]);

  // Set default calendar
  useEffect(() => {
    const defaultCalendar = availableCalendars.find(c => c.predefinito);
    if (defaultCalendar) {
      setTargetCalendarId(defaultCalendar.calendarId);
    }
  }, [availableCalendars]);

  const handleExport = async () => {
    if (!targetCalendarId) {
      toast({ variant: 'destructive', title: 'Errore', description: 'Seleziona un calendario di destinazione.' });
      return;
    }

    setIsExporting(true);
    setLastSyncResult(null);
    try {
      const res = await fetch('/api/odg/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dryRun: isDryRun,
          calendarId: targetCalendarId,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Errore sconosciuto dal server');
      }

      setLastSyncResult(data);

      toast({
        title: `Push Completato ${isDryRun ? '(Dry Run)' : ''}`,
        description: `${data?.stats?.inserted ?? 0} inseriti, ${data?.stats?.updated ?? 0} aggiornati, ${data?.stats?.deleted ?? 0} rimossi, ${data?.stats?.skipped ?? 0} saltati.`,
      });
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Errore durante il Push',
        description: e.message || 'Si è verificato un errore sconosciuto.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const pages = Array.isArray(odgData?.pages) ? odgData.pages : [];
  const isExportDisabled = !targetCalendarId || isExporting || pages.length === 0;

  if (!isMounted) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
        Caricamento ODG...
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>ODG (Ordine del Giorno)</CardTitle>
        <div className="flex justify-between items-center">
          <CardDescription>
            {odgData?.export_generated_at ? (
              `Ultimo export file: ${safeFormatDate(odgData.export_generated_at)}`
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
            <input
              type="checkbox"
              id="dryRunCheck"
              checked={isDryRun}
              onChange={(e) => setIsDryRun(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <label htmlFor="dryRunCheck" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
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
              <div className="font-mono text-sm space-y-1">
                <p>Scansionati: {lastSyncResult.stats?.scanned ?? 0}</p>
                <p className="text-green-600">Inseriti: {lastSyncResult.stats?.inserted ?? 0}</p>
                <p className="text-blue-600">Aggiornati: {lastSyncResult.stats?.updated ?? 0}</p>
                <p className="text-gray-500">Invariati: {lastSyncResult.stats?.unchanged ?? 0}</p>
                <p className="text-red-600">Rimossi: {lastSyncResult.stats?.deleted ?? 0}</p>
                <p className="text-yellow-600">Saltati: {lastSyncResult.stats?.skipped ?? 0}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading && <div className="text-center p-8">Caricamento dati in corso...</div>}
        {error && <div className="text-center p-8 text-destructive">{error}</div>}

        <div className="space-y-8">
          {pages.map((page, pageIndex) => {
            const rows = Array.isArray(page?.table?.rows) ? page.table.rows : [];
            const pageDateStr = page?.date?.label || (page?.date?.iso ? safeFormatDate(page.date.iso, 'dd/MM/yyyy') : 'Data N/D');

            return (
              <div key={page?.source_url || pageIndex}>
                <div className="flex justify-between items-baseline mb-2">
                  <h3 className="text-lg font-semibold font-headline">
                    Ordine del Giorno {pageDateStr}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Agg. Pagina Scala: {page?.last_update?.raw || 'N/D'}
                  </p>
                </div>
                <div className="rounded-md border overflow-x-auto">
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
                      {rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                            Nessun evento
                          </TableCell>
                        </TableRow>
                      ) : (
                        rows.map((row, rowIndex) => {
                          const timeDisplay = (row?.time?.start && row?.time?.end)
                            ? `${row.time.start} - ${row.time.end}`
                            : (row?.time?.raw || '');

                          return (
                            <TableRow key={rowIndex}>
                              <TableCell>{row?.recipient?.raw || row?.recipient?.normalized || ''}</TableCell>
                              <TableCell>{row?.place?.raw || row?.place?.normalized || ''}</TableCell>
                              <TableCell className="font-mono text-xs">{timeDisplay}</TableCell>
                              <TableCell>{row?.description?.raw || row?.description?.title || ''}</TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-between items-center mt-2 text-xs text-muted-foreground">
                  {(() => {
                    const rawSrc = page?.source_url;
                    const srcUrl = typeof rawSrc === 'string' ? rawSrc : ((rawSrc as any)?.url || (rawSrc as any)?.name || '');
                    if (!srcUrl) return <span />;
                    return (
                      <a href={srcUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        Fonte: {srcUrl}
                      </a>
                    );
                  })()}
                  <span>Righe: {rows.length}</span>
                </div>
              </div>
            );
          })}
          {!isLoading && !error && pages.length === 0 && (
            <p className="text-muted-foreground p-4 text-center">Nessun dato da visualizzare.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
