'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { 
  Camera, 
  History, 
  Clock, 
  RefreshCw, 
  ExternalLink, 
  Download, 
  Calendar as CalendarIcon, 
  AlertTriangle, 
  CheckCircle2, 
  Maximize2,
  FileImage,
  ChevronLeft,
  ChevronRight,
  Layers,
  Sparkles,
  ArrowRight,
  Eye,
  ZoomIn,
  ZoomOut,
  RotateCcw
} from 'lucide-react';
import { 
  format, 
  parseISO, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  getDay, 
  isToday 
} from 'date-fns';
import { it } from 'date-fns/locale';

export interface ModificationItem {
  id: string;
  timestamp: string;
  date: string;
  time: string;
  url_name: string;
  url?: string;
  type: 'baseline' | 'edit';
  filename: string;
  relative_path: string;
  drive_result?: {
    ok?: boolean;
    fileId?: string;
    webViewLink?: string;
  } | null;
  prev_hash?: string | null;
  new_hash?: string | null;
  note?: string;
}

export interface DaySummary {
  total: number;
  editsCount: number;
  baselinesCount: number;
  hasEdits: boolean;
}

interface ModificationsResponse {
  ok: boolean;
  filterDate: string | null;
  total: number;
  editsCount: number;
  baselinesCount: number;
  availableDates: string[];
  datesSummary?: Record<string, DaySummary>;
  modifications: ModificationItem[];
  error?: string;
}

export default function OdgModificationsView() {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return format(new Date(), 'yyyy-MM-dd');
  });
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [data, setData] = useState<ModificationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Dialog di ingrandimento
  const [previewItem, setPreviewItem] = useState<ModificationItem | null>(null);
  const [zoomScale, setZoomScale] = useState<number>(1);

  // Dialog di confronto baseline vs edit
  const [comparingEdit, setComparingEdit] = useState<ModificationItem | null>(null);

  const fetchModifications = useCallback(async (date: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/odg/modifications?date=${encodeURIComponent(date)}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ModificationsResponse = await res.json();
      if (!json.ok) throw new Error(json.error || 'Errore nel caricamento modifiche');
      setData(json);
    } catch (e: any) {
      console.error('Errore recupero modifiche:', e);
      setError(e.message || 'Errore di connessione');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModifications(selectedDate);
  }, [selectedDate, fetchModifications]);

  // Sincronizza il mese visualizzato se l'utente cambia data
  useEffect(() => {
    try {
      const parsed = parseISO(selectedDate);
      if (!isNaN(parsed.getTime())) {
        setCurrentMonth(prev => {
          if (format(prev, 'yyyy-MM') !== format(parsed, 'yyyy-MM')) {
            return parsed;
          }
          return prev;
        });
      }
    } catch {
      // Ignora errori di parsing data
    }
  }, [selectedDate]);

  const [globalDatesSummary, setGlobalDatesSummary] = useState<Record<string, DaySummary>>({});

  useEffect(() => {
    if (data?.datesSummary && Object.keys(data.datesSummary).length > 0) {
      setGlobalDatesSummary(prev => ({
        ...prev,
        ...data.datesSummary,
      }));
    }
  }, [data?.datesSummary]);

  const edits = useMemo(() => {
    return (data?.modifications || []).filter(m => m.type === 'edit');
  }, [data?.modifications]);

  const baselines = useMemo(() => {
    return (data?.modifications || []).filter(m => m.type === 'baseline');
  }, [data?.modifications]);

  const datesSummary = useMemo(() => {
    return {
      ...globalDatesSummary,
      ...(data?.datesSummary || {}),
    };
  }, [globalDatesSummary, data?.datesSummary]);

  // Elenco dei giorni con modifiche registrate nello storico
  const datesWithEditsList = useMemo(() => {
    return Object.entries(datesSummary)
      .filter(([_, s]) => s.hasEdits)
      .map(([date, s]) => ({ date, editsCount: s.editsCount }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [datesSummary]);

  // Calcolo griglia giorni del calendario per il mese corrente
  const calendarGrid = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    // Calcolo giorni vuoti iniziali (Lunedì = 0 ... Domenica = 6)
    const rawDayOfWeek = getDay(monthStart);
    const startPadding = (rawDayOfWeek + 6) % 7;

    return {
      monthStart,
      monthEnd,
      days,
      startPadding,
    };
  }, [currentMonth]);

  const handlePrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
  const handleNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));
  const handleGoToday = () => {
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    setCurrentMonth(today);
    setSelectedDate(todayStr);
  };

  const getPageTitle = (urlName: string) => {
    if (urlName === 'odg_0') return 'ODG Pagina 1 — Coro';
    if (urlName === 'odg_1') return 'ODG Pagina 2 — Coro';
    return `Pagina ${urlName}`;
  };

  const getImageUrl = (relPath: string) => {
    return `/api/screenshots/image?path=${encodeURIComponent(relPath)}`;
  };

  const formatHeaderDate = (dateStr: string) => {
    try {
      const d = parseISO(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return format(d, "EEEE d MMMM yyyy", { locale: it });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER PRINCIPALE */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-muted/40 p-4 rounded-xl border">
        <div>
          <h2 className="text-xl font-headline font-semibold flex items-center gap-2">
            <History className="h-5 w-5 text-amber-500" />
            Registro Modifiche & Archivio Screenshot
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Naviga tra le date tramite il calendario interattivo. I giorni con variazioni orarie o modifiche sono contrassegnati da apposito badge di riconoscimento.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {datesWithEditsList.length > 0 && (
            <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-mono text-xs hidden md:flex items-center gap-1.5 py-1">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span>{datesWithEditsList.length} date con variazioni rilevate</span>
            </Badge>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => fetchModifications(selectedDate)}
            disabled={isLoading}
            className="h-9 w-9"
            title="Aggiorna dati"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* ERRORE GENERALE */}
      {error && (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent className="p-4 text-xs text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Errore nel caricamento delle modifiche: {error}</span>
          </CardContent>
        </Card>
      )}

      {/* LAYOUT PRINCIPALE: CALENDARIO (SINISTRA) + DETTAGLIO GIORNATA (DESTRA) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* COLONNA 1: IL CALENDARIO INTERATTIVO (4/12 col) */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="shadow-sm border-muted-foreground/20 overflow-hidden">
            <CardHeader className="p-4 pb-3 border-b bg-card/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <CalendarIcon className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm capitalize">
                    {format(currentMonth, 'MMMM yyyy', { locale: it })}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleGoToday}
                    className="text-[11px] h-7 px-2"
                  >
                    Oggi
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handlePrevMonth}
                    className="h-7 w-7"
                    title="Mese precedente"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleNextMonth}
                    className="h-7 w-7"
                    title="Mese successivo"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-3">
              {/* INTESTAZIONE GIORNI DELLA SETTIMANA */}
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground pb-2 border-b">
                <span>Lun</span>
                <span>Mar</span>
                <span>Mer</span>
                <span>Gio</span>
                <span>Ven</span>
                <span>Sab</span>
                <span>Dom</span>
              </div>

              {/* GRIGLIA MENSILE DEI GIORNI */}
              <div className="grid grid-cols-7 gap-1 pt-2">
                {/* Spaziatori per i giorni vuoti del mese */}
                {Array.from({ length: calendarGrid.startPadding }).map((_, idx) => (
                  <div key={`pad-${idx}`} className="h-10 w-full" />
                ))}

                {/* Celle dei giorni */}
                {calendarGrid.days.map((dayDate) => {
                  const dateStr = format(dayDate, 'yyyy-MM-dd');
                  const dayNum = format(dayDate, 'd');
                  const isSelected = selectedDate === dateStr;
                  const isCurrentDay = isToday(dayDate);
                  
                  const summary = datesSummary[dateStr];
                  const hasEdits = Boolean(summary?.hasEdits);
                  const editsCount = summary?.editsCount || 0;
                  const hasShots = Boolean(summary && summary.total > 0);

                  return (
                    <button
                      key={dateStr}
                      type="button"
                      onClick={() => setSelectedDate(dateStr)}
                      className={`
                        relative h-11 w-full rounded-lg flex flex-col items-center justify-center transition-all text-xs
                        ${isSelected 
                          ? 'ring-2 ring-primary bg-primary text-primary-foreground font-bold shadow-sm z-10' 
                          : hasEdits
                            ? 'bg-amber-500/15 border-2 border-amber-500/80 text-amber-950 dark:text-amber-100 font-bold hover:bg-amber-500/25 shadow-xs'
                            : hasShots
                              ? 'bg-emerald-500/5 border border-emerald-500/30 text-foreground hover:bg-emerald-500/15'
                              : 'hover:bg-muted/70 text-foreground/80'
                        }
                        ${isCurrentDay && !isSelected ? 'ring-1 ring-primary/40 font-semibold' : ''}
                      `}
                      title={`${dateStr}${hasEdits ? ` — ${editsCount} modifiche rilevate` : hasShots ? ' — Baseline registrata' : ''}`}
                    >
                      {/* Numero giorno */}
                      <span className="leading-none text-xs">{dayNum}</span>

                      {/* SEGNO DI RICONOSCIMENTO PER GIORNI CON MODIFICHE (RICONOSCIMENTO IMMEDIATO) */}
                      {hasEdits && (
                        <span 
                          className={`
                            absolute -top-1.5 -right-1.5 flex h-4 min-w-4 px-1 items-center justify-center rounded-full text-[9px] font-black shadow-sm
                            ${isSelected 
                              ? 'bg-amber-400 text-amber-950 ring-1 ring-background' 
                              : 'bg-amber-500 text-white animate-bounce ring-1 ring-background'
                            }
                          `}
                          title={`${editsCount} screenshot di modifica rilevati`}
                        >
                          +{editsCount}
                        </span>
                      )}

                      {/* Pallino verde discreto per giorni con sola baseline regolare */}
                      {hasShots && !hasEdits && (
                        <span className="absolute bottom-1 h-1 w-1 rounded-full bg-emerald-500/80" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* LEGENDA VISIVA DEL CALENDARIO */}
              <div className="mt-4 pt-3 border-t space-y-1.5 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="flex h-3 w-3 rounded-full bg-amber-500/20 border-2 border-amber-500 shrink-0" />
                  <span className="text-amber-700 dark:text-amber-400 font-medium">
                    Giorno con Modifiche Rilevate (Screenshot aggiuntivo)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex h-3 w-3 rounded-full bg-emerald-500/20 border border-emerald-500/60 shrink-0" />
                  <span>Giorno con Baseline Iniziale (Ore 00:02, invariato)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex h-3 w-3 rounded-full bg-muted border shrink-0" />
                  <span>Nessuno scatto registrato</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* LISTA RAPIDA GIORNI CON MODIFICHE */}
          {datesWithEditsList.length > 0 && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-xs font-semibold flex items-center justify-between text-amber-700 dark:text-amber-400">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    Giorni con Variazioni Rilevate ({datesWithEditsList.length})
                  </span>
                  <span className="text-[10px] font-normal text-muted-foreground">Clicca per aprire</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                  {datesWithEditsList.map(item => {
                    const isCurrent = selectedDate === item.date;
                    return (
                      <button
                        key={item.date}
                        type="button"
                        onClick={() => setSelectedDate(item.date)}
                        className={`
                          text-[11px] font-mono px-2 py-1 rounded-md flex items-center gap-1.5 transition-colors border
                          ${isCurrent 
                            ? 'bg-amber-500 text-white border-amber-600 font-bold shadow-xs' 
                            : 'bg-background hover:bg-amber-500/10 text-foreground border-amber-500/30'
                          }
                        `}
                      >
                        <span>{item.date}</span>
                        <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5 bg-amber-500/20 text-amber-800 dark:text-amber-300">
                          +{item.editsCount} mod
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* COLONNA 2: DETTAGLI E SCREENSHOT DELLA GIORNATA SELEZIONATA (8/12 col) */}
        <div className="lg:col-span-8 space-y-5">
          
          {/* BANNER DATA SELEZIONATA */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-xl border bg-card/70 shadow-xs">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-headline font-semibold capitalize">
                  {formatHeaderDate(selectedDate)}
                </h3>
                {isToday(parseISO(selectedDate)) && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary">
                    Oggi
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                Data ISO: {selectedDate}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {edits.length > 0 ? (
                <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-medium text-xs py-1 px-2.5 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>{edits.length} {edits.length === 1 ? 'Modifica Rilevata' : 'Modifiche Rilevate'}</span>
                </Badge>
              ) : (
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 text-xs py-1 px-2.5 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Nessuna variazione rilevata</span>
                </Badge>
              )}

              {baselines.length > 0 && (
                <Badge variant="outline" className="border-muted-foreground/30 text-xs py-1 px-2.5 flex items-center gap-1.5 font-mono">
                  <Camera className="h-3 w-3" />
                  <span>{baselines.length} baseline</span>
                </Badge>
              )}
            </div>
          </div>

          {/* SEZIONE 1: MODIFICHE RILEVATE DURANTE LA GIORNATA */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span>Screenshot di Modifica Rilevati ({edits.length})</span>
              </h4>
              <span className="text-xs text-muted-foreground">
                Variazioni rispetto alla baseline iniziale
              </span>
            </div>

            {edits.length === 0 ? (
              <Card className="border-dashed bg-card/40">
                <CardContent className="p-8 text-center space-y-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 mx-auto">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-medium">Nessuna modifica oraria registrata per il {selectedDate}</p>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    I controlli periodici hanno confermato che i dati dell'Ordine del Giorno sono rimasti identici alla versione iniziale.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {edits.map((item) => {
                  const imgUrl = getImageUrl(item.relative_path);
                  const driveUrl = item.drive_result?.webViewLink;

                  // Cerca la baseline corrispondente alla stessa pagina per confronto rapido
                  const matchingBaseline = baselines.find(b => b.url_name === item.url_name);

                  return (
                    <Card key={item.id} className="overflow-hidden border-amber-500/40 shadow-xs hover:shadow-md transition-shadow">
                      <div className="flex flex-col sm:flex-row">
                        {/* ANTEPRIMA SCREENSHOT */}
                        <div 
                          className="sm:w-44 h-40 bg-muted/60 relative cursor-pointer group flex-shrink-0 overflow-hidden"
                          onClick={() => {
                            setZoomScale(1);
                            setPreviewItem(item);
                          }}
                        >
                          <img
                            src={imgUrl}
                            alt={item.filename}
                            className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-200"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                            <Maximize2 className="h-5 w-5" />
                          </div>
                        </div>

                        {/* DETTAGLI SCREENSHOT */}
                        <div className="p-3.5 flex flex-col justify-between flex-1 space-y-2">
                          <div>
                            <div className="flex items-center justify-between gap-1">
                              <Badge variant="outline" className="font-mono text-[11px] bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30">
                                {getPageTitle(item.url_name)}
                              </Badge>
                              <span className="text-xs font-mono font-semibold text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3 text-amber-500" />
                                {item.time}
                              </span>
                            </div>

                            <p className="text-xs font-medium text-foreground mt-2 flex items-center gap-1.5">
                              <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                              Modifica orari alle ore {item.time}
                            </p>
                            <p className="text-[10px] font-mono text-muted-foreground truncate mt-0.5" title={item.filename}>
                              {item.filename}
                            </p>
                          </div>

                          {/* PULSANTI AZIONE */}
                          <div className="flex items-center flex-wrap gap-1.5 pt-2 border-t text-xs">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setZoomScale(1);
                                setPreviewItem(item);
                              }}
                              className="text-xs h-7 px-2"
                            >
                              <Maximize2 className="h-3 w-3 mr-1" />
                              Ingrandisci
                            </Button>

                            {matchingBaseline && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setComparingEdit(item)}
                                className="text-xs h-7 px-2 bg-amber-500/15 text-amber-800 dark:text-amber-300 hover:bg-amber-500/25"
                                title="Confronta con la baseline iniziale delle 00:02"
                              >
                                <Layers className="h-3 w-3 mr-1" />
                                Confronta
                              </Button>
                            )}

                            {driveUrl && (
                              <Button
                                variant="outline"
                                size="sm"
                                asChild
                                className="text-xs h-7 px-2 text-primary hover:text-primary"
                              >
                                <a href={driveUrl} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  Drive
                                </a>
                              </Button>
                            )}

                            <Button
                              variant="ghost"
                              size="sm"
                              asChild
                              className="text-xs h-7 px-2 ml-auto"
                              title="Scarica file PNG"
                            >
                              <a href={imgUrl} download={item.filename}>
                                <Download className="h-3 w-3" />
                              </a>
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* SEZIONE 2: BASELINE INIZIALE DEL GIORNO (ORE 00:02) */}
          <div className="space-y-3 pt-3 border-t">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                <Camera className="h-4 w-4" />
                <span>Screenshot Baseline Iniziale ({baselines.length})</span>
              </h4>
              <span className="text-xs text-muted-foreground">
                Scatto di riferimento acquisito alle ore 00:02
              </span>
            </div>

            {baselines.length === 0 ? (
              <p className="text-xs text-muted-foreground italic p-2">
                Nessuna baseline trovata per la data {selectedDate}.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {baselines.map((base) => {
                  const imgUrl = getImageUrl(base.relative_path);
                  const driveUrl = base.drive_result?.webViewLink;

                  return (
                    <div 
                      key={base.id} 
                      className="flex items-center justify-between p-3 rounded-lg border bg-card/60 text-xs shadow-2xs"
                    >
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-14 h-11 bg-muted rounded overflow-hidden cursor-pointer flex-shrink-0 border"
                          onClick={() => {
                            setZoomScale(1);
                            setPreviewItem(base);
                          }}
                        >
                          <img
                            src={imgUrl}
                            alt={base.filename}
                            className="w-full h-full object-cover object-top hover:scale-105 transition-transform"
                            loading="lazy"
                          />
                        </div>
                        <div>
                          <p className="font-medium text-xs">{getPageTitle(base.url_name)}</p>
                          <p className="text-[11px] text-muted-foreground font-mono">
                            {base.time} — Baseline Iniziale
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setZoomScale(1);
                            setPreviewItem(base);
                          }}
                          className="h-7 text-xs px-2"
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          Vedi
                        </Button>
                        {driveUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            className="h-7 text-xs px-2 text-primary"
                          >
                            <a href={driveUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* DIALOG 1: INGRANDIMENTO SCREENSHOT CON CONTROLLI ZOOM */}
      <Dialog open={Boolean(previewItem)} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-4">
          <DialogHeader className="pb-2 border-b">
            <div className="flex items-center justify-between pr-6">
              <div>
                <DialogTitle className="text-base flex items-center gap-2">
                  <FileImage className="h-4 w-4 text-primary" />
                  <span>{previewItem ? getPageTitle(previewItem.url_name) : ''}</span>
                </DialogTitle>
                <DialogDescription className="text-xs font-mono">
                  {previewItem?.filename} — {previewItem?.date} alle ore {previewItem?.time}
                </DialogDescription>
              </div>
              <Badge variant={previewItem?.type === 'edit' ? 'default' : 'secondary'} className="text-xs">
                {previewItem?.type === 'edit' ? 'Screenshot di Modifica' : 'Baseline Iniziale (00:02)'}
              </Badge>
            </div>
          </DialogHeader>

          {previewItem && (
            <div className="relative flex-1 overflow-auto bg-muted/30 rounded-lg p-2 flex items-center justify-center min-h-[420px]">
              <img
                src={getImageUrl(previewItem.relative_path)}
                alt={previewItem.filename}
                style={{ transform: `scale(${zoomScale})`, transformOrigin: 'top center' }}
                className="max-w-full h-auto rounded border shadow-sm transition-transform duration-150"
              />

              {/* Toolbar Zoom Flottante */}
              <div className="absolute bottom-4 right-4 bg-background/90 backdrop-blur border rounded-lg p-1 flex items-center gap-1 shadow-md">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setZoomScale(prev => Math.min(prev + 0.25, 2.5))}
                  title="Ingrandisci"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
                <span className="text-[10px] font-mono px-1">
                  {Math.round(zoomScale * 100)}%
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setZoomScale(prev => Math.max(prev - 0.25, 0.5))}
                  title="Riduci"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setZoomScale(1)}
                  title="Reimposta 100%"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t text-xs">
            <span className="text-muted-foreground font-mono text-[11px]">
              {previewItem?.drive_result?.webViewLink ? 'Disponibile su Google Drive' : 'Archiviato su disco locale'}
            </span>

            <div className="flex items-center gap-2">
              {previewItem?.drive_result?.webViewLink && (
                <Button variant="outline" size="sm" asChild className="text-xs h-8">
                  <a href={previewItem.drive_result.webViewLink} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Apri su Google Drive
                  </a>
                </Button>
              )}
              {previewItem && (
                <Button size="sm" asChild className="text-xs h-8">
                  <a href={getImageUrl(previewItem.relative_path)} download={previewItem.filename}>
                    <Download className="h-3 w-3 mr-1" />
                    Scarica PNG
                  </a>
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOG 2: CONFRONTO VISIVO AFFIANCATO (BASELINE VS EDIT) */}
      <Dialog open={Boolean(comparingEdit)} onOpenChange={(open) => !open && setComparingEdit(null)}>
        <DialogContent className="max-w-6xl max-h-[92vh] flex flex-col p-4">
          <DialogHeader className="pb-2 border-b">
            <div className="flex items-center justify-between pr-6">
              <div>
                <DialogTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4 text-amber-500" />
                  <span>Confronto Visivo: Baseline (00:02) vs Modifica ({comparingEdit?.time})</span>
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Confronta lo scatto di riferimento iniziale con lo scatto differenziale rilevato nel corso della giornata.
                </DialogDescription>
              </div>
              <Badge variant="outline" className="text-xs bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300">
                {comparingEdit ? getPageTitle(comparingEdit.url_name) : ''}
              </Badge>
            </div>
          </DialogHeader>

          {comparingEdit && (() => {
            const baseItem = baselines.find(b => b.url_name === comparingEdit.url_name);

            return (
              <div className="flex-1 overflow-auto p-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* COLONNA 1: BASELINE */}
                  <div className="space-y-2 border rounded-xl p-3 bg-muted/20">
                    <div className="flex items-center justify-between border-b pb-2">
                      <div className="flex items-center gap-1.5 font-medium text-xs">
                        <Camera className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Baseline Iniziale (00:02)</span>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground">{baseItem?.time || '00:02'}</span>
                    </div>
                    {baseItem ? (
                      <div className="max-h-[500px] overflow-auto rounded border bg-background">
                        <img
                          src={getImageUrl(baseItem.relative_path)}
                          alt="Baseline"
                          className="w-full h-auto"
                        />
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic p-4 text-center">
                        Nessuna baseline registrata per questa pagina.
                      </p>
                    )}
                  </div>

                  {/* COLONNA 2: MODIFICA RILEVATA */}
                  <div className="space-y-2 border border-amber-500/40 rounded-xl p-3 bg-amber-500/5">
                    <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
                      <div className="flex items-center gap-1.5 font-medium text-xs text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        <span>Modifica Rilevata (Ore {comparingEdit.time})</span>
                      </div>
                      <Badge className="text-[9px] px-1.5 py-0 h-4 bg-amber-500 text-white">Edit</Badge>
                    </div>
                    <div className="max-h-[500px] overflow-auto rounded border bg-background">
                      <img
                        src={getImageUrl(comparingEdit.relative_path)}
                        alt="Modifica"
                        className="w-full h-auto"
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="flex items-center justify-end pt-2 border-t text-xs">
            <Button variant="outline" size="sm" onClick={() => setComparingEdit(null)}>
              Chiudi Confronto
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
