'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Users, UserCheck, UserX, Trash2, PlusCircle, RefreshCw, CheckCircle2, AlertCircle, Edit, Shield, User } from 'lucide-react';
import type { UserProfile, UserRole, UserStatus } from '@/lib/types';

export default function GestioneUtentiTab() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal Modifica Utente (Solo Ruolo, Stato e Password)
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editNome, setEditNome] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('user');
  const [editStatus, setEditStatus] = useState<UserStatus>('approved');
  const [isSavingUser, setIsSavingUser] = useState(false);

  // Modal Nuovo Utente
  const [isNewUserModalOpen, setIsNewUserModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newNome, setNewNome] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('user');

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

  const handleOpenEditModal = (user: UserProfile) => {
    setSelectedUser(user);
    setEditNome(user.nome || '');
    setEditUsername(user.username || '');
    setEditEmail(user.email || '');
    setEditPassword('');
    setEditRole(user.role);
    setEditStatus(user.status);
    setIsEditModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setIsSavingUser(true);
    setFeedback(null);
    try {
      const bodyPayload: any = {
        nome: editNome.trim(),
        username: editUsername.trim(),
        email: editEmail.trim(),
        role: editRole,
        status: editStatus,
      };
      if (editPassword.trim()) {
        bodyPayload.password = editPassword.trim();
      }

      const res = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Errore salvataggio');

      setFeedback({ type: 'success', message: `Profilo di "${editNome}" aggiornato con successo.` });
      setIsEditModalOpen(false);
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
        body: JSON.stringify({ action: 'approve' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Errore approvazione');

      setFeedback({ type: 'success', message: `Utente "${user.nome || user.username}" approvato con successo!` });
      loadUsers();
    } catch (e: any) {
      setFeedback({ type: 'error', message: e.message });
    }
  };

  const handleQuickReject = async (user: UserProfile) => {
    if (!confirm(`Sei sicuro di voler rifiutare la richiesta di "${user.nome || user.username}"?`)) return;
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
          username: newUsername.trim(),
          nome: newNome.trim(),
          email: newEmail.trim(),
          password: newPassword.trim(),
          role: newRole,
          status: 'approved',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Errore creazione utente');

      setFeedback({ type: 'success', message: `Utente "${newNome}" creato con successo.` });
      setIsNewUserModalOpen(false);
      setNewUsername('');
      setNewNome('');
      setNewEmail('');
      setNewPassword('');
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
                <CardTitle>Gestione Account Utenti</CardTitle>
                <CardDescription>
                  Approva le registrazioni, gestisci i ruoli e abilita l'accesso per i coristi.
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
              Questi utenti hanno richiesto un account e attendono la tua approvazione per accedere.
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
                      <TableCell className="text-xs">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString('it-IT') : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white h-8 text-xs"
                            onClick={() => handleQuickApprove(u)}
                          >
                            <UserCheck className="mr-1.5 h-3.5 w-3.5" /> Approva
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
            Tutti gli account presenti nel sistema. L'associazione con i calendari si gestisce direttamente nella scheda <strong>Impostazioni</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Ruolo</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.nome}</TableCell>
                    <TableCell className="font-mono text-xs">{u.username}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{u.email || '-'}</TableCell>
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
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => handleOpenEditModal(u)}
                        >
                          <Edit className="mr-1 h-3.5 w-3.5" /> Modifica
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
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* MODAL MODIFICA UTENTE */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifica Utente: {selectedUser?.nome}</DialogTitle>
            <DialogDescription>
              Aggiorna i dati anagrafici, il ruolo o lo stato dell'account.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveUser} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-nome" className="text-xs font-semibold">Nome e Cognome *</Label>
                <Input
                  id="edit-nome"
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-username" className="text-xs font-semibold">Username *</Label>
                <Input
                  id="edit-username"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-email" className="text-xs font-semibold">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-password" className="text-xs font-semibold">Nuova Password</Label>
              <Input
                id="edit-password"
                type="text"
                placeholder="Lascia vuoto per non modificare"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
              />
              <span className="text-[11px] text-muted-foreground">Inserisci un valore solo per reimpostare la password.</span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="edit-role" className="text-xs font-semibold">Ruolo</Label>
                <select
                  id="edit-role"
                  className="w-full h-9 px-3 py-1 text-sm rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                >
                  <option value="user">Corista (Standard)</option>
                  <option value="admin">Amministratore</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-status" className="text-xs font-semibold">Stato Account</Label>
                <select
                  id="edit-status"
                  className="w-full h-9 px-3 py-1 text-sm rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as UserStatus)}
                >
                  <option value="approved">Approvato</option>
                  <option value="pending">In attesa</option>
                  <option value="disabled">Disabilitato</option>
                  <option value="rejected">Rifiutato</option>
                </select>
              </div>
            </div>

            <DialogFooter className="pt-4 border-t gap-2">
              <Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)}>
                Annulla
              </Button>
              <Button type="submit" disabled={isSavingUser}>
                {isSavingUser ? 'Salvataggio...' : 'Salva Modifiche'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL NUOVO UTENTE */}
      <Dialog open={isNewUserModalOpen} onOpenChange={setIsNewUserModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crea Nuovo Utente</DialogTitle>
            <DialogDescription>
              Crea manualmente un account già approvato e pronto per l'accesso.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateNewUser} className="space-y-3.5 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-nome" className="text-xs font-semibold">Nome e Cognome *</Label>
                <Input id="new-nome" value={newNome} onChange={(e) => setNewNome(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-username" className="text-xs font-semibold">Username *</Label>
                <Input id="new-username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-email" className="text-xs font-semibold">Email</Label>
              <Input id="new-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-password" className="text-xs font-semibold">Password Iniziale *</Label>
              <Input id="new-password" type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-role" className="text-xs font-semibold">Ruolo</Label>
              <select
                id="new-role"
                className="w-full h-9 px-3 py-1 text-sm rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
              >
                <option value="user">Corista</option>
                <option value="admin">Amministratore</option>
              </select>
            </div>

            <DialogFooter className="pt-4 border-t gap-2">
              <Button type="button" variant="outline" onClick={() => setIsNewUserModalOpen(false)}>Annulla</Button>
              <Button type="submit" disabled={isSavingUser}>Crea Utente</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
