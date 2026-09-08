'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
  Calendar, 
  AlertTriangle, 
  CheckCircle2, 
  Maximize2,
  FileImage,
  Layers,
  ArrowRight
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
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

interface ModificationsResponse {
  ok: boolean;
  filterDate: string | null;
  total: number;
  editsCount: number;
  baselinesCount: number;
  availableDates: string[];
  modifications: ModificationItem[];
  error?: string;
}

export default function OdgModificationsView() {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [data, setData] = useState<ModificationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<ModificationItem | null>(null);

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

  const edits = (data?.modifications || []).filter(m => m.type === 'edit');
  const baselines = (data?.modifications || []).filter(m => m.type === 'baseline');

  const getPageTitle = (urlName: string) => {
    if (urlName === 'odg_0') return 'ODG Pagina 1 — Coro';
    if (urlName === 'odg_1') return 'ODG Pagina 2 — Coro';
    return `Pagina ${urlName}`;
  };

  const getImageUrl = (relPath: string) => {
    return `/api/screenshots/image?path=${encodeURIComponent(relPath)}`;
  };

  return (
    <div className="space-y-6">
      {/* HEADER & SELETTORE DATA */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-muted/40 p-4 rounded-xl border">
        <div>
          <h2 className="text-xl font-headline font-semibold flex items-center gap-2">
            <History className="h-5 w-5 text-amber-500" />
            Registro Modifiche & Screenshot ODG
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Monitoraggio continuo con scatto baseline alle 00:02 e rilevamento automatico differenze ogni 5 minuti
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-background border px-3 py-1.5 rounded-lg text-xs">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent border-0 focus:outline-none text-xs font-mono"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
            className="text-xs h-9"
          >
            Oggi
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => fetchModifications(selectedDate)}
            disabled={isLoading}
            className="h-9 w-9"
            title="Aggiorna elenco"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* STATISTICHE DELLA GIORNATA */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Modifiche Rilevate Oggi</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
                  {edits.length}
                </span>
                <span className="text-xs text-muted-foreground">
                  {edits.length === 1 ? 'screenshot aggiuntivo' : 'screenshot aggiuntivi'}
                </span>
              </div>
            </div>
            <div className="p-2.5 rounded-full bg-amber-500/10 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Screenshot Baseline (Iniziale)</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold font-mono">
                  {baselines.length}
                </span>
                <span className="text-xs text-muted-foreground">
                  {baselines.length > 0 ? 'ore 00:02 acquisite' : 'in attesa'}
                </span>
              </div>
            </div>
            <div className="p-2.5 rounded-full bg-primary/10 text-primary">
              <Camera className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Frequenza Monitoraggio</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-base font-semibold">Ogni 5 Minuti</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">Controllo continuo differenze hash</p>
            </div>
            <div className="p-2.5 rounded-full bg-green-500/10 text-green-600">
              <Clock className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ERRORE CARICAMENTO */}
      {error && (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent className="p-4 text-xs text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span>Errore nel caricamento delle modifiche: {error}</span>
          </CardContent>
        </Card>
      )}

      {/* SEZIONE 1: MODIFICHE RILEVATE (SCREENSHOT AGGIUNTIVI) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Modifiche Rilevate Durante la Giornata ({edits.length})
          </h3>
          <span className="text-xs text-muted-foreground">
            Screenshot scattati per variazioni di contenuto
          </span>
        </div>

        {edits.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center space-y-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10 text-green-600 mx-auto">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium">Nessuna modifica rilevata per la data selezionata ({selectedDate})</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                I contenuti delle pagine ODG sono rimasti identici alla versione iniziale. Non è stato necessario effettuare scatti aggiuntivi.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {edits.map((item) => {
              const imgUrl = getImageUrl(item.relative_path);
              const driveUrl = item.drive_result?.webViewLink;

              return (
                <Card key={item.id} className="overflow-hidden border-amber-500/30 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex flex-col sm:flex-row">
                    {/* ANTEPRIMA IMMAGINE */}
                    <div 
                      className="sm:w-44 h-40 bg-muted/60 relative cursor-pointer group flex-shrink-0 overflow-hidden"
                      onClick={() => setPreviewItem(item)}
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

                    {/* DETTAGLI MODIFICA */}
                    <div className="p-4 flex flex-col justify-between flex-1 space-y-3">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className="font-mono text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30">
                            {getPageTitle(item.url_name)}
                          </Badge>
                          <span className="text-xs font-mono font-medium text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {item.time}
                          </span>
                        </div>

                        <p className="text-xs font-medium text-foreground mt-2 flex items-center gap-1.5">
                          <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                          Modifica rilevata alle ore {item.time}
                        </p>
                        <p className="text-[11px] font-mono text-muted-foreground truncate mt-1" title={item.filename}>
                          {item.filename}
                        </p>
                      </div>

                      {/* AZIONI: INGRANDISCI / DRIVE / DOWNLOAD */}
                      <div className="flex items-center gap-2 pt-2 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPreviewItem(item)}
                          className="text-xs h-7 px-2"
                        >
                          <Maximize2 className="h-3 w-3 mr-1" />
                          Ingrandisci
                        </Button>

                        {driveUrl ? (
                          <Button
                            variant="outline"
                            size="sm"
                            asChild
                            className="text-xs h-7 px-2 text-primary hover:text-primary"
                          >
                            <a href={driveUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3 w-3 mr-1" />
                              Google Drive
                            </a>
                          </Button>
                        ) : (
                          <span className="text-[10px] text-muted-foreground italic">Locale</span>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          className="text-xs h-7 px-2 ml-auto"
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

      {/* SEZIONE 2: BASELINE INIZIALE (00:02) */}
      <div className="space-y-3 pt-4 border-t">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
            <Camera className="h-4 w-4" />
            Screenshot Baseline Iniziale del Giorno ({baselines.length})
          </h3>
          <span className="text-xs text-muted-foreground">
            Versione di riferimento catturata alle 00:02
          </span>
        </div>

        {baselines.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
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
                  className="flex items-center justify-between p-3 rounded-lg border bg-card/60 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-12 h-10 bg-muted rounded overflow-hidden cursor-pointer flex-shrink-0"
                      onClick={() => setPreviewItem(base)}
                    >
                      <img
                        src={imgUrl}
                        alt={base.filename}
                        className="w-full h-full object-cover object-top"
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
                      onClick={() => setPreviewItem(base)}
                      className="h-7 text-xs px-2"
                    >
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

      {/* DIALOG PREVIEW IMMAGINE INGRANDITA */}
      <Dialog open={Boolean(previewItem)} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-4">
          <DialogHeader className="pb-2 border-b">
            <div className="flex items-center justify-between pr-6">
              <div>
                <DialogTitle className="text-base flex items-center gap-2">
                  <FileImage className="h-4 w-4 text-primary" />
                  {previewItem ? getPageTitle(previewItem.url_name) : ''}
                </DialogTitle>
                <DialogDescription className="text-xs font-mono">
                  {previewItem?.filename} — {previewItem?.date} alle ore {previewItem?.time}
                </DialogDescription>
              </div>
              <Badge variant={previewItem?.type === 'edit' ? 'default' : 'secondary'} className="text-xs">
                {previewItem?.type === 'edit' ? 'Screenshot di Modifica' : 'Baseline 00:02'}
              </Badge>
            </div>
          </DialogHeader>

          {previewItem && (
            <div className="flex-1 overflow-auto bg-muted/40 rounded-lg p-2 flex items-center justify-center min-h-[400px]">
              <img
                src={getImageUrl(previewItem.relative_path)}
                alt={previewItem.filename}
                className="max-w-full h-auto rounded border shadow-sm"
              />
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t text-xs">
            <span className="text-muted-foreground font-mono text-[11px]">
              {previewItem?.drive_result?.webViewLink ? 'Disponibile su Google Drive' : 'Archiviato localmente'}
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
    </div>
  );
}
