'use client';

import React, { useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, User, UserPlus, LogIn, AlertCircle, CheckCircle2, ShieldCheck, Clock } from 'lucide-react';

interface LoginDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function LoginDialog({ open, onOpenChange }: LoginDialogProps) {
  const { login, register } = useAuth();

  // Login form state
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isPendingApproval, setIsPendingApproval] = useState(false);

  // Register form state
  const [regUsername, setRegUsername] = useState('');
  const [regNome, setRegNome] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsPendingApproval(false);
    setIsLoggingIn(true);

    try {
      const res = await login(loginUsername, loginPassword);
      if (!res.ok) {
        if (res.status === 'pending') {
          setIsPendingApproval(true);
        } else {
          setLoginError(res.error || 'Credenziali non valide.');
        }
      } else {
        if (onOpenChange) onOpenChange(false);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    setRegSuccess(null);

    if (regPassword !== regConfirmPassword) {
      setRegError('Le password non coincidono.');
      return;
    }

    if (regPassword.length < 4) {
      setRegError('La password deve contenere almeno 4 caratteri.');
      return;
    }

    setIsRegistering(true);

    try {
      const res = await register({
        username: regUsername,
        nome: regNome,
        email: regEmail,
        password: regPassword,
      });

      if (res.ok) {
        setRegSuccess(res.message || 'Registrazione completata! In attesa di approvazione.');
        setRegUsername('');
        setRegNome('');
        setRegEmail('');
        setRegPassword('');
        setRegConfirmPassword('');
      } else {
        setRegError(res.error || 'Errore durante la registrazione.');
      }
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lock className="h-6 w-6" />
          </div>
          <DialogTitle className="text-xl">Accesso ScalaScheduler</DialogTitle>
          <DialogDescription>
            Accedi con il tuo account o registrati come nuovo artista del Coro per sincronizzare i tuoi calendari.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="login" className="flex items-center gap-1.5">
              <LogIn className="h-4 w-4" /> Accedi
            </TabsTrigger>
            <TabsTrigger value="register" className="flex items-center gap-1.5">
              <UserPlus className="h-4 w-4" /> Registrati
            </TabsTrigger>
          </TabsList>

          {/* TAB LOGIN */}
          <TabsContent value="login">
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              {loginError && (
                <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              {isPendingApproval && (
                <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-sm">
                    <Clock className="h-4 w-4 shrink-0" />
                    Account in attesa di approvazione
                  </div>
                  <p>
                    La tua registrazione è stata ricevuta. L'amministratore deve confermare il tuo account e assegnarti i calendari prima che tu possa effettuare l'accesso.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="login-username">Username o Email</Label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="login-username"
                    placeholder="admin o nome.cognome"
                    className="pl-9"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    className="pl-9"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isLoggingIn}>
                {isLoggingIn ? 'Verifica in corso...' : 'Accedi'}
              </Button>

              <div className="p-2.5 rounded bg-muted/50 text-[11px] text-muted-foreground text-center">
                <span>Account iniziale predefinito: </span>
                <strong className="font-mono">admin</strong> / <strong className="font-mono">admin</strong>
              </div>
            </form>
          </TabsContent>

          {/* TAB REGISTRAZIONE */}
          <TabsContent value="register">
            <form onSubmit={handleRegisterSubmit} className="space-y-3">
              {regError && (
                <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{regError}</span>
                </div>
              )}

              {regSuccess && (
                <div className="p-3 rounded-md bg-green-500/10 border border-green-500/30 text-green-700 dark:text-green-300 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-sm">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Registrazione Inviata
                  </div>
                  <p>{regSuccess}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="reg-nome" className="text-xs">Nome e Cognome *</Label>
                  <Input
                    id="reg-nome"
                    placeholder="Mario Rossi"
                    value={regNome}
                    onChange={(e) => setRegNome(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="reg-username" className="text-xs">Username *</Label>
                  <Input
                    id="reg-username"
                    placeholder="mario.rossi"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="reg-email" className="text-xs">Email (Opzionale)</Label>
                <Input
                  id="reg-email"
                  type="email"
                  placeholder="mario.rossi@example.com"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="reg-password" className="text-xs">Password *</Label>
                  <Input
                    id="reg-password"
                    type="password"
                    placeholder="••••••••"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="reg-confirm" className="text-xs">Conferma Password *</Label>
                  <Input
                    id="reg-confirm"
                    type="password"
                    placeholder="••••••••"
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full mt-2" disabled={isRegistering}>
                {isRegistering ? 'Invio richiesta...' : 'Richiedi Registrazione'}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
