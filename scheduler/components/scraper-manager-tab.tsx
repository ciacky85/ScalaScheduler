'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle, Trash2, Play, RefreshCw, Save, CheckCircle2, AlertCircle, Clock, Globe, Database, Shield } from 'lucide-react';
import type { ScraperConfig, ScraperStatus } from '@/lib/scraper/odg-scraper';

export default function ScraperManagerTab() {
  const [config, setConfig] = useState<ScraperConfig>({
    urls: [],
    output_file: '/data/odg_structured.json',
    schedules: ['07:00', '21:00'],
    run_on_start: true,
  });

  const [status, setStatus] = useState<ScraperStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [newUrl, setNewUrl] = useState<string>('');
  const [newSchedule, setNewSchedule] = useState<string>('');

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [resCfg, resStat] = await Promise.all([
        fetch('/api/scraper/config'),
        fetch('/api/scraper/status'),
      ]);

      const dataCfg = await resCfg.json();
      const dataStat = await resStat.json();

      if (dataCfg.ok && dataCfg.config) {
        setConfig(dataCfg.config);
      }
      if (dataStat.ok && dataStat.status) {
        setStatus(dataStat.status);
      }
    } catch (e: any) {
      setFeedback({ type: 'error', message: 'Errore durante il caricamento dei dati: ' + e.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleSaveConfig = async () => {
    setIsSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/scraper/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Errore salvataggio');

      setFeedback({ type: 'success', message: 'Configurazione salvata con successo in config.json!' });
      loadAll();
    } catch (e: any) {
      setFeedback({ type: 'error', message: e.message || 'Errore durante il salvataggio' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRunScraper = async () => {
    setIsRunning(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/scraper/run', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Errore esecuzione');

      setFeedback({
        type: 'success',
        message: `Scraping completato con successo! Pagine: ${data.result.pagesScraped}, Righe totali estratte: ${data.result.totalRows}.`,
      });
      loadAll();
    } catch (e: any) {
      setFeedback({ type: 'error', message: e.message || 'Errore durante lo scraping' });
    } finally {
      setIsRunning(false);
    }
  };

  const addUrl = () => {
    if (!newUrl.trim()) return;
    if (config.urls.includes(newUrl.trim())) return;
    setConfig({ ...config, urls: [...config.urls, newUrl.trim()] });
    setNewUrl('');
  };

  const removeUrl = (index: number) => {
    setConfig({ ...config, urls: config.urls.filter((_, i) => i !== index) });
  };

  const addSchedule = () => {
    const trimmed = newSchedule.trim();
    if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(trimmed)) {
      setFeedback({ type: 'error', message: 'Formato orario non valido. Usa HH:mm (es. 07:00, 21:00)' });
      return;
    }
    if (config.schedules.includes(trimmed)) return;
    setConfig({ ...config, schedules: [...config.schedules, trimmed].sort() });
    setNewSchedule('');
  };

  const removeSchedule = (sched: string) => {
    setConfig({ ...config, schedules: config.schedules.filter(s => s !== sched) });
  };

  return (
    <div className="grid gap-6">
      {/* Intestazione Admin */}
      <Card className="border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/10">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <CardTitle>ODG Scraper Manager</CardTitle>
            </div>
            <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/10">
              Area Riservata Amministratore
            </Badge>
          </div>
          <CardDescription>
            Gestisci la configurazione e l'esecuzione del modulo <strong>ODG Scraper</strong> del Teatro alla Scala.
            Le impostazioni vengono salvate nel volume condiviso Portainer (<code>config.json</code>).
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Messaggi Feedback */}
      {feedback && (
        <div
          className={`p-4 rounded-lg text-sm border flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30'
              : 'bg-destructive/10 text-destructive border-destructive/30'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Stato Scraper & Azioni Rapide */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                Stato Ultimo Scraping
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={loadAll} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Generato il:</span>
              <span className="font-medium font-mono text-xs">
                {status?.lastGeneratedAt ? new Date(status.lastGeneratedAt).toLocaleString('it-IT') : 'Nessun dato'}
              </span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Pagine analizzate:</span>
              <span className="font-semibold">{status?.pageCount ?? 0}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Righe totali estratte:</span>
              <Badge variant="secondary" className="font-mono">{status?.totalRows ?? 0}</Badge>
            </div>
            {status?.pages && status.pages.length > 0 && (
              <div className="pt-2">
                <span className="text-xs font-semibold text-muted-foreground block mb-2">Dettaglio Pagine:</span>
                <div className="space-y-1.5">
                  {status.pages.map((p, i) => (
                    <div key={i} className="text-xs p-2 rounded bg-muted/50 flex justify-between items-center">
                      <div>
                        <div className="font-medium">{p.dateLabel || `Pagina ${i + 1}`}</div>
                        <div className="text-[10px] text-muted-foreground">{p.lastUpdateRaw || 'N/D'}</div>
                      </div>
                      <Badge variant="outline" className="text-xs">{p.rowCount} righe</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Esecuzione Manuale & Informazioni */}
        <Card className="flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Play className="h-4 w-4 text-primary" />
              Esecuzione Manuale On-Demand
            </CardTitle>
            <CardDescription>
              Forza l'esecuzione immediata dello scraping per scaricare subito gli ordini del giorno aggiornati senza attendere il cron Docker.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 rounded-md bg-muted/60 text-xs text-muted-foreground space-y-1">
              <div><strong>Container Scraper:</strong> python:3.12-slim (ODG Scraper 2.4)</div>
              <div><strong>File di Output:</strong> <code>public/odg_structured.json</code></div>
              <div><strong>Timezone:</strong> Europe/Rome</div>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={handleRunScraper}
              disabled={isRunning || isLoading}
            >
              {isRunning ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Scraping in corso...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4 fill-current" />
                  Esegui Scraper Adesso
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Configurazione URL */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            URL Pagine ERP Teatro alla Scala
          </CardTitle>
          <CardDescription>
            Indirizzi web da cui estrarre le tabelle degli ordini del giorno del coro.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>URL Pagina</TableHead>
                  <TableHead className="text-right w-20">Azione</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {config.urls.map((url, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{i + 1}</TableCell>
                    <TableCell className="font-mono text-xs break-all">{url}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeUrl(i)}
                        disabled={config.urls.length <= 1}
                        aria-label="Rimuovi URL"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="https://erp.teatroallascala.org/.../pxf_dspagine_coro.xhtml?pps=..."
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              className="font-mono text-xs"
            />
            <Button variant="outline" onClick={addUrl} disabled={!newUrl.trim()}>
              <PlusCircle className="mr-2 h-4 w-4" /> Aggiungi URL
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Configurazione Schedulazione & Parametri */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Orari di Esecuzione Automatica (`schedules`)
          </CardTitle>
          <CardDescription>
            Orari del giorno in cui lo scraper esegue il fetch automatico in background (formato HH:mm).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label className="text-xs font-medium text-muted-foreground block mb-2">Orari Attivi:</Label>
            <div className="flex flex-wrap gap-2">
              {config.schedules.map((sched) => (
                <Badge key={sched} variant="secondary" className="font-mono text-sm py-1 px-3 flex items-center gap-2">
                  <span>{sched}</span>
                  <button
                    onClick={() => removeSchedule(sched)}
                    className="hover:text-destructive focus:outline-none"
                    aria-label={`Rimuovi orario ${sched}`}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex gap-2 max-w-sm">
            <Input
              placeholder="07:00"
              value={newSchedule}
              onChange={(e) => setNewSchedule(e.target.value)}
              className="font-mono text-sm w-32"
              maxLength={5}
            />
            <Button variant="outline" onClick={addSchedule} disabled={!newSchedule.trim()}>
              <PlusCircle className="mr-2 h-4 w-4" /> Aggiungi Orario
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <Label htmlFor="runOnStart" className="flex flex-col gap-1 cursor-pointer">
              <span className="font-medium">Esegui all'avvio del container (`run_on_start`)</span>
              <span className="text-xs font-normal text-muted-foreground">
                Se attivo, lo scraper effettua una prima scansione immediata appena il container viene avviato.
              </span>
            </Label>
            <Switch
              id="runOnStart"
              checked={config.run_on_start}
              onCheckedChange={(checked) => setConfig({ ...config, run_on_start: checked })}
            />
          </div>

          <div className="pt-2">
            <Button onClick={handleSaveConfig} disabled={isSaving} size="lg" className="w-full sm:w-auto">
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? 'Salvataggio in corso...' : 'Salva Configurazione Scraper'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
