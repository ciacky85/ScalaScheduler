'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useCalendars } from '@/contexts/calendar-context';
import { Loader2, RefreshCw, History, CalendarDays } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import OdgModificationsView from './odg-modifications-view';

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

import { useAuth } from '@/contexts/auth-context';

export default function OdgTab() {
  const [isMounted, setIsMounted] = useState(false);
  const { toast } = useToast();
  const { calendars } = useCalendars();
  const { user, isAdmin, isCalendarAllowed } = useAuth();
  const [targetCalendarId, setTargetCalendarId] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [odgData, setOdgData] = useState<ODGPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<{ stats: SyncStats; details: any[]; dryRun: boolean } | null>(null);
  const [isDryRun, setIsDryRun] = useState(false);
  const [todayEditsCount, setTodayEditsCount] = useState<number>(0);

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    fetch(`/api/odg/modifications?date=${today}`)
      .then(res => res.json())
      .then(json => {
        if (json && json.ok) {
          setTodayEditsCount(json.editsCount || 0);
        }
      })
      .catch(() => {});
  }, []);

  const availableCalendars = (calendars || [])
    .filter(c => c && c.tipo === 'odg')
    .filter(c => !user || isAdmin || isCalendarAllowed(c));

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
    <Tabs defaultValue="programma" className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <TabsList className="bg-muted/80 p-1 border">
          <TabsTrigger value="programma" className="text-xs sm:text-sm flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            <span>Programma ODG & Push</span>
          </TabsTrigger>
          <TabsTrigger value="modifiche" className="text-xs sm:text-sm flex items-center gap-2">
            <History className="h-4 w-4 text-amber-500" />
            <span>Modifiche Rilevate & Screenshot</span>
            {todayEditsCount > 0 && (
              <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0 h-4 bg-amber-500/20 text-amber-700 dark:text-amber-300">
                {todayEditsCount} oggi
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="programma" className="mt-0">
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
                  className="rounded border-gray-300 text-primary shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                />
                <label htmlFor="dryRunCheck" className="text-sm font-medium text-muted-foreground cursor-pointer">
                  Dry Run (Simula senza modificare Google Calendar)
                </label>
              </div>
            </div>

            {/* Sync Feedback Alert */}
            {lastSyncResult && (
              <div className={`p-4 rounded-lg border text-sm ${lastSyncResult.dryRun ? 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-200' : 'bg-green-500/10 border-green-500/30 text-green-800 dark:text-green-200'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold">
                    {lastSyncResult.dryRun ? 'Simulazione Push Completata (Dry Run)' : 'Push su Google Calendar Completato con Successo'}
                  </span>
                  <span className="text-xs font-mono opacity-75">
                    {lastSyncResult.stats.scanned} scansionati
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono mt-2 pt-2 border-t border-current/20">
                  <span>Inseriti: <strong>{lastSyncResult.stats.inserted}</strong></span>
                  <span>Aggiornati: <strong>{lastSyncResult.stats.updated}</strong></span>
                  <span>Rimossi: <strong>{lastSyncResult.stats.deleted}</strong></span>
                  <span>Saltati (invariati): <strong>{lastSyncResult.stats.skipped + lastSyncResult.stats.unchanged}</strong></span>
                </div>
              </div>
            )}

            {error && <p className="text-destructive">{error}</p>}

            <div className="space-y-6">
              {pages.map((page, index) => {
                const pageDate = page.date?.iso
                  ? safeFormatDate(page.date.iso, 'EEEE d MMMM yyyy')
                  : page.date?.label || `Pagina ${index + 1}`;
                const rows = page.table?.rows || [];
                const srcUrl = page.source_url || '';

                return (
                  <div key={index} className="border rounded-lg p-4 space-y-4">
                    <div className="flex justify-between items-center border-b pb-2">
                      <h3 className="text-lg font-semibold capitalize">{pageDate}</h3>
                      <span className="text-sm text-muted-foreground">
                        {page.last_update?.raw ? `Agg. ${page.last_update.raw}` : ''}
                      </span>
                    </div>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[15%]">Destinatario</TableHead>
                          <TableHead className="w-[15%]">Luogo</TableHead>
                          <TableHead className="w-[15%]">Orario</TableHead>
                          <TableHead className="w-[55%]">Descrizione</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((row, rIdx) => (
                          <TableRow key={rIdx}>
                            <TableCell className="font-medium text-xs">
                              {row.recipient?.normalized || row.recipient?.raw || '—'}
                            </TableCell>
                            <TableCell className="text-xs">
                              {row.place?.normalized || row.place?.raw || '—'}
                            </TableCell>
                            <TableCell className="text-xs font-mono">
                              {row.time?.start
                                ? `${row.time.start}${row.time.end ? ` - ${row.time.end}` : ''}`
                                : row.time?.raw || '—'}
                            </TableCell>
                            <TableCell className="text-xs">
                              {row.description?.title && (
                                <span className="font-semibold block">{row.description.title}</span>
                              )}
                              <span>{row.description?.raw || '—'}</span>
                              {row.description?.details && row.description.details.length > 0 && (
                                <span className="block text-[11px] text-muted-foreground mt-0.5">
                                  {row.description.details.join(' | ')}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    <div className="flex justify-between items-center text-xs text-muted-foreground pt-2">
                      {(() => {
                        const m = srcUrl.match(/pps=(\d+)/);
                        const ppsLabel = m ? `ODG Pagina ${parseInt(m[1], 10) + 1} (pps=${m[1]})` : srcUrl;
                        return srcUrl ? (
                          <a href={srcUrl} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1 font-mono">
                            <span>{ppsLabel}</span>
                          </a>
                        ) : null;
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
      </TabsContent>

      <TabsContent value="modifiche" className="mt-0">
        <OdgModificationsView />
      </TabsContent>
    </Tabs>
  );
}
