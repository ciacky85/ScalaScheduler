'use client';

import React, { useState, useEffect } from 'react';
import { useSettings } from '@/contexts/settings-context';
import { useCalendars } from '@/contexts/calendar-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { ImpostazioniCalendario } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle, Edit, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { v4 as uuidv4 } from 'uuid';


import { useAuth } from '@/contexts/auth-context';
import { Badge } from '@/components/ui/badge';

const CalendarSettingsSection = ({
  title,
  tipo,
}: {
  title: string;
  tipo: 'importaCalendario' | 'odg';
}) => {
  const { calendars, addCalendar, updateCalendar, removeCalendar, setAsDefault } = useCalendars();
  const { user, isAdmin, isCalendarAllowed } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<ImpostazioniCalendario | null>(null);

  const calendarsForType = calendars
    .filter(c => c.tipo === tipo)
    .filter(c => !user || isAdmin || isCalendarAllowed(c));

  const handleOpenModal = (cal: ImpostazioniCalendario | null) => {
    setEditingCalendar(cal);
    setIsModalOpen(true);
  };

  const handleSave = (cal: ImpostazioniCalendario) => {
    if (editingCalendar) {
      updateCalendar(cal);
    } else {
      addCalendar({ ...cal, id: uuidv4() });
    }
    setIsModalOpen(false);
    setEditingCalendar(null);
  };
  
  const handleSetDefault = (id: string) => {
    setAsDefault(id, tipo);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>
              {isAdmin
                ? 'Gestisci i calendari Google e assegna il proprietario (Owner).'
                : 'I tuoi calendari Google abilitati per la sincronizzazione.'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Etichetta</TableHead>
                <TableHead>ID Calendario</TableHead>
                <TableHead>Proprietario (Owner)</TableHead>
                <TableHead>Predefinito</TableHead>
                {isAdmin && <TableHead className="text-right w-[140px]">Azioni</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {calendarsForType.length > 0 ? calendarsForType.map(cal => (
                <TableRow key={cal.id}>
                  <TableCell className="font-medium">{cal.label}</TableCell>
                  <TableCell className="font-code text-xs truncate max-w-xs">{cal.calendarId}</TableCell>
                  <TableCell>
                    {cal.ownerName ? (
                      <Badge variant="outline" className="font-sans text-xs bg-primary/5 text-primary border-primary/20">
                        {cal.ownerName}
                      </Badge>
                    ) : cal.ownerUserId ? (
                      <Badge variant="outline" className="font-mono text-xs">
                        {cal.ownerUserId}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Tutti (Globale)</span>
                    )}
                  </TableCell>
                  <TableCell>
                     <Switch
                        checked={cal.predefinito}
                        onCheckedChange={() => handleSetDefault(cal.id)}
                        aria-label={`Imposta ${cal.label} come predefinito`}
                      />
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenModal(cal)} aria-label={`Modifica ${cal.label}`}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => removeCalendar(cal.id)} aria-label={`Rimuovi ${cal.label}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 5 : 4} className="text-center text-muted-foreground">
                    Nessun calendario configurato.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        
        {isAdmin && (
          <Button className="mt-4" onClick={() => handleOpenModal(null)}>
            <PlusCircle className="mr-2 h-4 w-4" /> Aggiungi Calendario
          </Button>
        )}

        {isModalOpen && (
            <CalendarEditModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                calendar={editingCalendar}
                defaultTipo={tipo}
            />
        )}
      </CardContent>
    </Card>
  );
};


interface CalendarEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (calendar: ImpostazioniCalendario) => void;
    calendar: ImpostazioniCalendario | null;
    defaultTipo: 'importaCalendario' | 'odg';
}

function CalendarEditModal({ isOpen, onClose, onSave, calendar, defaultTipo }: CalendarEditModalProps) {
    const [label, setLabel] = useState(calendar?.label || '');
    const [calendarId, setCalendarId] = useState(calendar?.calendarId || '');
    const [tipo, setTipo] = useState(calendar?.tipo || defaultTipo);
    const [ownerUserId, setOwnerUserId] = useState(calendar?.ownerUserId || calendar?.ownerId || '');
    const [usersList, setUsersList] = useState<Array<{ id: string; nome: string; username: string; email?: string }>>([]);

    useEffect(() => {
      fetch('/api/admin/users')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && Array.isArray(data.users)) {
            setUsersList(data.users);
          }
        })
        .catch(() => {});
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const selectedUser = usersList.find(u => u.id === ownerUserId || u.username === ownerUserId);
        onSave({
            id: calendar?.id || '',
            label,
            calendarId,
            tipo,
            predefinito: calendar?.predefinito || false,
            ownerUserId: ownerUserId.trim() || undefined,
            ownerId: ownerUserId.trim() || undefined,
            ownerName: selectedUser ? selectedUser.nome : calendar?.ownerName,
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{calendar ? 'Modifica Calendario' : 'Aggiungi Calendario'}</DialogTitle>
                    <DialogDescription>
                        Inserisci i dettagli per il calendario Google e associa il proprietario (Owner).
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="label">Etichetta</Label>
                        <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="calendarId">ID Calendario Google</Label>
                        <Input id="calendarId" value={calendarId} onChange={(e) => setCalendarId(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="ownerUserId">Proprietario Calendario (Owner)</Label>
                        {usersList.length > 0 ? (
                          <select
                            id="ownerUserId"
                            className="w-full p-2 text-sm rounded-md border bg-background"
                            value={ownerUserId}
                            onChange={(e) => setOwnerUserId(e.target.value)}
                          >
                            <option value="">-- Nessun proprietario specifico (Tutti) --</option>
                            {usersList.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.nome} ({u.username})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            id="ownerUserId"
                            placeholder="ID utente o username"
                            value={ownerUserId}
                            onChange={(e) => setOwnerUserId(e.target.value)}
                          />
                        )}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="tipo">Tipo</Label>
                         <Select onValueChange={(v: 'importaCalendario' | 'odg') => setTipo(v)} value={tipo}>
                            <SelectTrigger id="tipo">
                                <SelectValue placeholder="Seleziona tipo" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="importaCalendario">Importa Calendario (Prove)</SelectItem>
                                <SelectItem value="odg">ODG (Ordine del Giorno)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
                        <Button type="submit">Salva</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}



export default function ImpostazioniTab() {
  const { settings, updateSettings, isLoaded } = useSettings();
  const [driveUrl, setDriveUrl] = useState<string>('');
  const [salvaLocale, setSalvaLocale] = useState<boolean>(true);
  const [isTestingDrive, setIsTestingDrive] = useState<boolean>(false);
  const [driveStatus, setDriveStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({
    type: 'idle',
    message: '',
  });

  // Carica la configurazione Google Drive dal backend al mount
  React.useEffect(() => {
    fetch('/api/settings/drive')
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.config) {
          setDriveUrl(data.config.googleDriveFolderUrl || settings.googleDriveFolderUrl || '');
          setSalvaLocale(data.config.salvaAncheInLocale !== undefined ? data.config.salvaAncheInLocale : (settings.salvaAncheInLocale ?? true));
        }
      })
      .catch(() => {
        setDriveUrl(settings.googleDriveFolderUrl || '');
        setSalvaLocale(settings.salvaAncheInLocale ?? true);
      });
  }, [settings.googleDriveFolderUrl, settings.salvaAncheInLocale]);

  const handleSaveDriveSettings = async (testConnection: boolean = false) => {
    setIsTestingDrive(true);
    setDriveStatus({ type: 'idle', message: '' });

    try {
      const res = await fetch('/api/settings/drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          googleDriveFolderUrl: driveUrl,
          salvaAncheInLocale: salvaLocale,
          testConnection: testConnection,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Impossibile salvare la configurazione');
      }

      updateSettings({
        googleDriveFolderUrl: driveUrl,
        salvaAncheInLocale: salvaLocale,
      });

      if (testConnection) {
        if (data.testResult?.ok) {
          setDriveStatus({
            type: 'success',
            message: `Connessione riuscita! Cartella trovata: "${data.testResult.folderName}"`,
          });
        } else {
          setDriveStatus({
            type: 'error',
            message: data.testResult?.error || 'Errore durante la verifica della cartella.',
          });
        }
      } else {
        setDriveStatus({
          type: 'success',
          message: 'Configurazione Google Drive salvata con successo.',
        });
      }
    } catch (err: any) {
      setDriveStatus({
        type: 'error',
        message: err.message || 'Errore di comunicazione con il server.',
      });
    } finally {
      setIsTestingDrive(false);
    }
  };

  if (!isLoaded) {
    return <div>Caricamento impostazioni...</div>;
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
            <CardTitle>Autenticazione Service Account</CardTitle>
            <CardDescription>
                L'esportazione degli eventi avviene tramite un service account. Assicurati che l'indirizzo email del service account
                (<code className="bg-muted px-1 py-0.5 rounded-sm text-sm select-all">calendar-scheduler@sturdy-yen-458414-h7.iam.gserviceaccount.com</code>)
                sia stato aggiunto con i permessi di scrittura ai calendari di Google Calendar e come <strong>Editor</strong> alla cartella di Google Drive per gli screenshot.
            </CardDescription>
        </CardHeader>
      </Card>

      <CalendarSettingsSection title="Calendari per Importa Calendario" tipo="importaCalendario" />
      <CalendarSettingsSection title="Calendari per ODG" tipo="odg" />

      {/* Sezione Configurazione Google Drive & Screenshot (Area Amministratore) */}
      <Card className="border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/10">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <span>Salvataggio Screenshot su Google Drive</span>
            </CardTitle>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
              Area Amministratore
            </span>
          </div>
          <CardDescription>
            Configura la cartella Google Drive in cui archiviare automaticamente gli screenshot degli ordini del giorno e scegli se mantenere una copia locale.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="googleDriveFolderUrl" className="flex flex-col gap-1">
              <span className="font-medium">Link o ID Cartella Google Drive</span>
              <span className="text-xs font-normal text-muted-foreground">
                Incolla il link completo (es. <code>https://drive.google.com/drive/folders/...</code>) oppure l'ID della cartella.
              </span>
            </Label>
            <Input
              id="googleDriveFolderUrl"
              placeholder="https://drive.google.com/drive/folders/1abc123xyz..."
              value={driveUrl}
              onChange={(e) => setDriveUrl(e.target.value)}
              className="font-mono text-sm bg-background"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4 bg-background">
            <Label htmlFor="salvaAncheInLocale" className="flex flex-col gap-1 cursor-pointer">
              <span className="font-medium">Salva anche in locale</span>
              <span className="text-sm font-normal text-muted-foreground">
                {salvaLocale
                  ? 'Attivo: gli screenshot verranno salvati sia nella cartella locale che caricati su Google Drive.'
                  : 'Disattivato: gli screenshot verranno salvati esclusivamente su Google Drive, risparmiando spazio locale.'}
              </span>
            </Label>
            <Switch
              id="salvaAncheInLocale"
              checked={salvaLocale}
              onCheckedChange={(checked) => setSalvaLocale(checked)}
              aria-label="Salva anche in locale gli screenshot"
            />
          </div>

          {driveStatus.message && (
            <div
              className={`p-3 rounded-md text-sm border ${
                driveStatus.type === 'success'
                  ? 'bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30'
                  : 'bg-destructive/10 text-destructive border-destructive/30'
              }`}
            >
              {driveStatus.message}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              onClick={() => handleSaveDriveSettings(false)}
              disabled={isTestingDrive}
              variant="default"
            >
              Salva Configurazione Drive
            </Button>
            <Button
              onClick={() => handleSaveDriveSettings(true)}
              disabled={isTestingDrive || !driveUrl.trim()}
              variant="outline"
            >
              {isTestingDrive ? 'Verifica in corso...' : 'Verifica Connessione Cartella'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Opzioni Generali</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="flex items-center justify-between">
            <Label htmlFor="durataDefault" className="flex flex-col gap-1">
              <span>Durata predefinita (minuti)</span>
              <span className="text-sm font-normal text-muted-foreground">
                Per eventi con solo orario di inizio.
              </span>
            </Label>
            <Input
              id="durataDefault"
              type="number"
              value={settings.durataDefaultMin}
              onChange={(e) => updateSettings({ durataDefaultMin: parseInt(e.target.value, 10) || 60 })}
              className="w-24"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="consentiDateFuoriMese" className="flex flex-col gap-1">
              <span>Permetti date fuori dal mese</span>
               <span className="text-sm font-normal text-muted-foreground">
                Consente di importare eventi a cavallo di due mesi.
              </span>
            </Label>
            <Switch
              id="consentiDateFuoriMese"
              checked={settings.consentiDateFuoriMese}
              onCheckedChange={(checked) => updateSettings({ consentiDateFuoriMese: checked })}
              aria-label="Permetti date fuori dal mese di intestazione"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="timezone">
              <span>Timezone</span>
            </Label>
            <Input id="timezone" value={settings.timezone} disabled className="w-48" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
