'use client';

import React, { useState } from 'react';
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


const CalendarSettingsSection = ({
  title,
  tipo,
}: {
  title: string;
  tipo: 'importaCalendario' | 'odg';
}) => {
  const { calendars, addCalendar, updateCalendar, removeCalendar, setAsDefault } = useCalendars();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<ImpostazioniCalendario | null>(null);

  const calendarsForType = calendars.filter(c => c.tipo === tipo);

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
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Etichetta</TableHead>
                <TableHead>ID Calendario</TableHead>
                <TableHead>Predefinito</TableHead>
                <TableHead className="text-right w-[140px]">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calendarsForType.length > 0 ? calendarsForType.map(cal => (
                <TableRow key={cal.id}>
                  <TableCell>{cal.label}</TableCell>
                  <TableCell className="font-code text-xs truncate max-w-xs">{cal.calendarId}</TableCell>
                  <TableCell>
                     <Switch
                        checked={cal.predefinito}
                        onCheckedChange={() => handleSetDefault(cal.id)}
                        aria-label={`Imposta ${cal.label} come predefinito`}
                      />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenModal(cal)} aria-label={`Modifica ${cal.label}`}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => removeCalendar(cal.id)} aria-label={`Rimuovi ${cal.label}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">Nessun calendario configurato.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <Button className="mt-4" onClick={() => handleOpenModal(null)}>
          <PlusCircle className="mr-2 h-4 w-4" /> Aggiungi Calendario
        </Button>

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

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({
            id: calendar?.id || '', // L'ID verrà generato se è un nuovo calendario
            label,
            calendarId,
            tipo,
            predefinito: calendar?.predefinito || false,
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{calendar ? 'Modifica Calendario' : 'Aggiungi Calendario'}</DialogTitle>
                    <DialogDescription>
                        Inserisci i dettagli per il calendario Google.
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
                (<code className="bg-muted px-1 py-0.5 rounded-sm text-sm">calendar-scheduler@sturdy-yen-458414-h7.iam.gserviceaccount.com</code>)
                sia stato aggiunto con i permessi di scrittura ("Effettuare modifiche agli eventi") ai calendari di destinazione nelle impostazioni di Google Calendar.
            </CardDescription>
        </CardHeader>
      </Card>

      <CalendarSettingsSection title="Calendari per Importa Calendario" tipo="importaCalendario" />
      <CalendarSettingsSection title="Calendari per ODG" tipo="odg" />

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
