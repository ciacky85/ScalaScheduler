'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCalendars } from '@/contexts/calendar-context';
import { Users, UserCheck, UserX, Shield, Trash2, Calendar, PlusCircle, RefreshCw, Key, CheckCircle2, AlertCircle } from 'lucide-react';
import type { UserProfile, UserRole, UserStatus } from '@/lib/types';

export default function GestioneUtentiTab() {
  const { calendars } = useCalendars();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal Assegnazione Calendari & Approvazione
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [tempAssignedIds, setTempAssignedIds] = useState<string[]>([]);
  const [tempRole, setTempRole] = useState<UserRole>('user');
  const [tempStatus, setTempStatus] = useState<UserStatus>('approved');
  const [isSavingUser, setIsSavingUser] = useState(false);

  // Modal Nuovo Utente
  const [isNewUserModalOpen, setIsNewUserModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newNome, setNewNome] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('user');
  const [newAssignedIds, setNewAssignedIds] = useState<string[]>([]);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/users', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.ok) {
        setUsers(data.users || []);
      } else {
        setFeedback({ type: 'error', message: data.error || 'Errore durante il caricamento utenti' });
      }
    } catch (e: any) {
      setFeedback({ type: 'error', message: 'Errore di rete: ' + e.message });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleOpenAssignModal = (user: UserProfile) => {
    setSelectedUser(user);
    setTempAssignedIds(user.assignedCalendarIds || []);
    setTempRole(user.role);
    setTempStatus(user.status);
    setIsCalendarModalOpen(true);
  };

  const handleToggleCalendar = (calId: string) => {
    if (tempAssignedIds.includes(calId)) {
      setTempAssignedIds(tempAssignedIds.filter(id => id !== calId));
    } else {
      setTempAssignedIds([...tempAssignedIds, calId]);
    }
  };

  const handleSaveUserPermissions = async () => {
    if (!selectedUser) return;
    setIsSavingUser(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: tempRole,
          status: tempStatus,
          assignedCalendarIds: tempAssignedIds,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Errore salvataggio');

      setFeedback({ type: 'success', message: `Permessi utente "${selectedUser.username}" aggiornati con successo.` });
      setIsCalendarModalOpen(false);
      loadUsers();
    } catch (e: any) {
      setFeedback({ type: 'error', message: e.message });
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleQuickApprove = async (user: UserProfile) => {
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          assignedCalendarIds: user.assignedCalendarIds || [],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Errore approvazione');

      setFeedback({ type: 'success', message: `Utente "${user.username}" approvato con successo!` });
      loadUsers();
    } catch (e: any) {
      setFeedback({ type: 'error', message: e.message });
    }
  };

  const handleQuickReject = async (user: UserProfile) => {
    if (!confirm(`Sei sicuro di voler rifiutare la richiesta di "${user.username}"?`)) return;
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Errore rifiuto');

      setFeedback({ type: 'success', message: `Richiesta di "${user.username}" rifiutata.` });
      loadUsers();
    } catch (e: any) {
      setFeedback({ type: 'error', message: e.message });
    }
  };

  const handleDeleteUser = async (user: UserProfile) => {
    if (!confirm(`Sei sicuro di voler eliminare definitivamente l'utente "${user.username}"?`)) return;
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Errore eliminazione');

      setFeedback({ type: 'success', message: `Utente "${user.username}" eliminato.` });
      loadUsers();
    } catch (e: any) {
      setFeedback({ type: 'error', message: e.message });
    }
  };

  const handleCreateNewUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingUser(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername,
          nome: newNome,
          email: newEmail,
          password: newPassword,
          role: newRole,
          status: 'approved',
          assignedCalendarIds: newAssignedIds,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Errore creazione utente');

      setFeedback({ type: 'success', message: `Utente "${newUsername}" creato con successo.` });
      setIsNewUserModalOpen(false);
      setNewUsername('');
      setNewNome('');
      setNewEmail('');
      setNewPassword('');
      setNewAssignedIds([]);
      loadUsers();
    } catch (e: any) {
      setFeedback({ type: 'error', message: e.message });
    } finally {
      setIsSavingUser(false);
    }
  };

  const pendingUsers = users.filter(u => u.status === 'pending');

  return (
    <div className="grid gap-6">
      {/* Header Gestione Utenti */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Gestione Utenti & Calendari</CardTitle>
                <CardDescription>
                  Approva le registrazioni dei coristi, assegna i calendari dedicati e gestisci i permessi di accesso.
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadUsers} disabled={isLoading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Ricarica
              </Button>
              <Button size="sm" onClick={() => setIsNewUserModalOpen(true)}>
                <PlusCircle className="mr-2 h-4 w-4" /> Nuovo Utente
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Feedback Messages */}
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

      {/* Sezione Richieste in Attesa */}
      {pendingUsers.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Badge variant="destructive" className="bg-amber-600 text-white">
                {pendingUsers.length} in attesa
              </Badge>
              <CardTitle className="text-base text-amber-900 dark:text-amber-200">
                Richieste di Registrazione da Confermare
              </CardTitle>
            </div>
            <CardDescription>
              Questi utenti si sono registrati e necessitano della tua approvazione e assegnazione dei calendari prima di accedere.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md bg-background overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Data Richiesta</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.nome}</TableCell>
                      <TableCell className="font-mono text-xs">{u.username}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{u.email || '-'}</TableCell>
                      <TableCell className="text-xs">{new Date(u.createdAt).toLocaleDateString('it-IT')}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            className="bg-green-600 hover:bg-green-700 text-white h-8 text-xs"
                            onClick={() => handleOpenAssignModal(u)}
                          >
                            <UserCheck className="mr-1.5 h-3.5 w-3.5" /> Approva & Assegna
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:bg-destructive/10 h-8 text-xs"
                            onClick={() => handleQuickReject(u)}
                          >
                            <UserX className="mr-1.5 h-3.5 w-3.5" /> Rifiuta
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabella Tutti gli Utenti */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Elenco Utenti Registrati</CardTitle>
          <CardDescription>
            Tutti gli account presenti nel sistema. Fai clic su <strong>"Modifica"</strong> per assegnare i calendari o cambiare ruolo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Ruolo</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Calendari Assegnati</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const assignedCount = u.assignedCalendarIds?.length || 0;
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.nome}</TableCell>
                      <TableCell className="font-mono text-xs">{u.username}</TableCell>
                      <TableCell>
                        <Badge variant={u.role === 'admin' ? 'default' : 'secondary'} className="text-xs">
                          {u.role === 'admin' ? 'Amministratore' : 'Corista'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            u.status === 'approved'
                              ? 'border-green-500 text-green-700 dark:text-green-300 bg-green-500/10'
                              : u.status === 'pending'
                              ? 'border-amber-500 text-amber-700 dark:text-amber-300 bg-amber-500/10'
                              : 'border-destructive text-destructive bg-destructive/10'
                          }`}
                        >
                          {u.status === 'approved' ? 'Approvato' : u.status === 'pending' ? 'In attesa' : 'Disabilitato'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {u.role === 'admin' ? (
                          <span className="text-xs text-muted-foreground italic">Tutti i calendari (Admin)</span>
                        ) : assignedCount > 0 ? (
                          <Badge variant="outline" className="text-xs font-mono">
                            {assignedCount} {assignedCount === 1 ? 'calendario' : 'calendari'}
                          </Badge>
                        ) : (
                          <span className="text-xs text-destructive italic">Nessun calendario</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => handleOpenAssignModal(u)}
                          >
                            <Calendar className="mr-1 h-3.5 w-3.5" /> Modifica
                          </Button>
                          {u.username !== 'admin' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              onClick={() => handleDeleteUser(u)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* MODAL ASSEGNAZIONE CALENDARI E PERMESSI */}
      <Dialog open={isCalendarModalOpen} onOpenChange={setIsCalendarModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Permessi & Calendari: {selectedUser?.nome}</DialogTitle>
            <DialogDescription>
              Configura il ruolo e seleziona i calendari Google visibili e utilizzabili da questo utente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Ruolo Utente</Label>
                <select
                  className="w-full p-2 text-sm rounded-md border bg-background"
                  value={tempRole}
                  onChange={(e) => setTempRole(e.target.value as UserRole)}
                >
                  <option value="user">Corista (Utente standard)</option>
                  <option value="admin">Amministratore (Accesso completo)</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Stato Account</Label>
                <select
                  className="w-full p-2 text-sm rounded-md border bg-background"
                  value={tempStatus}
                  onChange={(e) => setTempStatus(e.target.value as UserStatus)}
                >
                  <option value="approved">Approvato (Abilitato)</option>
                  <option value="pending">In attesa di approvazione</option>
                  <option value="disabled">Disabilitato</option>
                  <option value="rejected">Rifiutato</option>
                </select>
              </div>
            </div>

            {tempRole === 'user' && (
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs font-semibold">Calendari Google Associati:</Label>
                <div className="space-y-2 max-h-56 overflow-y-auto border rounded-md p-3">
                  {calendars.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nessun calendario configurato nel sistema.</p>
                  ) : (
                    calendars.map((cal) => {
                      const isChecked = tempAssignedIds.includes(cal.calendarId);
                      return (
                        <label
                          key={cal.id}
                          className="flex items-center justify-between p-2 rounded hover:bg-muted/50 cursor-pointer text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleCalendar(cal.calendarId)}
                              className="h-4 w-4 rounded text-primary"
                            />
                            <div>
                              <div className="font-medium">{cal.label}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">{cal.calendarId}</div>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-[10px]">
                            {cal.tipo === 'odg' ? 'ODG' : 'Import'}
                          </Badge>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCalendarModalOpen(false)}>Annulla</Button>
            <Button onClick={handleSaveUserPermissions} disabled={isSavingUser}>
              {isSavingUser ? 'Salvataggio...' : 'Salva Modifiche'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL NUOVO UTENTE */}
      <Dialog open={isNewUserModalOpen} onOpenChange={setIsNewUserModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crea Nuovo Utente</DialogTitle>
            <DialogDescription>
              Crea manualmente un account corista o amministratore già approvato.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateNewUser} className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Nome e Cognome *</Label>
                <Input value={newNome} onChange={(e) => setNewNome(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Username *</Label>
                <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Password Iniziale *</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Ruolo</Label>
              <select
                className="w-full p-2 text-sm rounded-md border bg-background"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
              >
                <option value="user">Corista</option>
                <option value="admin">Amministratore</option>
              </select>
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setIsNewUserModalOpen(false)}>Annulla</Button>
              <Button type="submit" disabled={isSavingUser}>Crea Utente</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
