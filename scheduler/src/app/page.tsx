'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ImpostazioniTab from '@/app/components/impostazioni-tab';
import ImportaCalendarioTab from '@/app/components/importa-calendario-tab';
import OdgTab from '@/app/components/odg-tab';
import ScraperManagerTab from '@/app/components/scraper-manager-tab';
import GestioneUtentiTab from '@/app/components/admin/gestione-utenti-tab';
import { TabErrorBoundary } from '@/app/components/error-boundary';
import { useAuth } from '@/contexts/auth-context';
import { CalendarDays, Bot, Users, LogOut, User as UserIcon, Shield, Lock, UserPlus, LogIn, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import type { RigaCalendario } from '@/lib/types';

export default function Home() {
  const { user, isLoading, isAdmin, login, register, logout } = useAuth();

  // Stati form di Login integrato
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isPendingApproval, setIsPendingApproval] = useState(false);

  // Stati form Registrazione
  const [regUsername, setRegUsername] = useState('');
  const [regNome, setRegNome] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState<string | null>(null);

  const [parsedData, setParsedData] = useState<{
    mese: string;
    anno: number;
    righe: RigaCalendario[];
  } | null>(null);
  const [isDataLoading, setIsDataLoading] = useState(false);

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

    if (regPassword.length < 3) {
      setRegError('La password deve contenere almeno 3 caratteri.');
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
        setRegSuccess(res.message || 'Registrazione completata! In attesa di approvazione da parte dell\'amministratore.');
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

  // SCHERMATA DI CARICAMENTO INIZIALE
  if (isLoading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mx-auto animate-pulse">
            <CalendarDays className="h-6 w-6" />
          </div>
          <p className="text-sm text-muted-foreground font-medium">Caricamento ScalaScheduler...</p>
        </div>
      </div>
    );
  }

  // LOGIN GATE: Se non loggato, mostra ESCLUSIVAMENTE la schermata di Login
  if (!user) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-gradient-to-b from-background to-muted/40 p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground mx-auto shadow-lg shadow-primary/20">
              <CalendarDays className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-headline font-bold tracking-tight">ScalaScheduler</h1>
            <p className="text-sm text-muted-foreground">
              Teatro alla Scala — Chorus Calendar Sync
            </p>
          </div>

          <Card className="shadow-lg border-muted">
            <CardHeader className="pb-3 text-center">
              <CardTitle className="text-lg">Accesso Riservato</CardTitle>
              <CardDescription>
                Accedi con il tuo account o registrati per sincronizzare i tuoi calendari.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={authTab} onValueChange={(v) => setAuthTab(v as 'login' | 'register')} className="w-full">
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
                          La tua registrazione è stata ricevuta. L'amministratore deve confermare il tuo account prima del primo accesso.
                        </p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="gate-username">Username o Email</Label>
                      <div className="relative">
                        <UserIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="gate-username"
                          placeholder="admin o nome utente"
                          className="pl-9"
                          value={loginUsername}
                          onChange={(e) => setLoginUsername(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="gate-password">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="gate-password"
                          type="password"
                          placeholder="••••••••"
                          className="pl-9"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <Button type="submit" className="w-full" size="lg" disabled={isLoggingIn}>
                      {isLoggingIn ? 'Verifica in corso...' : 'Accedi al Sistema'}
                    </Button>
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
                        <Label htmlFor="gate-reg-nome" className="text-xs">Nome e Cognome *</Label>
                        <Input
                          id="gate-reg-nome"
                          placeholder="Mario Rossi"
                          value={regNome}
                          onChange={(e) => setRegNome(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="gate-reg-username" className="text-xs">Username *</Label>
                        <Input
                          id="gate-reg-username"
                          placeholder="mario.rossi"
                          value={regUsername}
                          onChange={(e) => setRegUsername(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="gate-reg-email" className="text-xs">Email (Opzionale)</Label>
                      <Input
                        id="gate-reg-email"
                        type="email"
                        placeholder="mario.rossi@example.com"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="gate-reg-password" className="text-xs">Password *</Label>
                        <Input
                          id="gate-reg-password"
                          type="password"
                          placeholder="••••••••"
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="gate-reg-confirm" className="text-xs">Conferma Password *</Label>
                        <Input
                          id="gate-reg-confirm"
                          type="password"
                          placeholder="••••••••"
                          value={regConfirmPassword}
                          onChange={(e) => setRegConfirmPassword(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <Button type="submit" className="w-full mt-2" disabled={isRegistering}>
                      {isRegistering ? 'Invio in corso...' : 'Invia Richiesta Registrazione'}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // APPLICAZIONE COMPLETA (VISIBILE SOLO DOPO IL LOGIN)
  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      {/* HEADER PRINCIPALE */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/95 backdrop-blur px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-headline font-semibold tracking-tight">ScalaScheduler</h1>
            <p className="text-[11px] text-muted-foreground hidden sm:block">Teatro alla Scala — Chorus Calendar Sync</p>
          </div>
        </div>

        {/* Informazioni Utente Loggato & Logout */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 bg-muted/60 py-1 px-2.5 rounded-full text-xs">
            {user.role === 'admin' ? (
              <Shield className="h-3.5 w-3.5 text-primary" />
            ) : (
              <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="font-medium max-w-[120px] sm:max-w-[180px] truncate">{user.nome}</span>
            <Badge variant={user.role === 'admin' ? 'default' : 'secondary'} className="text-[10px] py-0 px-1.5 h-4">
              {user.role === 'admin' ? 'Admin' : 'Corista'}
            </Badge>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout()}
            className="h-8 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-3.5 w-3.5 mr-1" />
            <span className="hidden sm:inline">Esci</span>
          </Button>
        </div>
      </header>

      {/* CONTENUTO PRINCIPALE */}
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <Tabs defaultValue="import" className="w-full">
          <TabsList className={`grid w-full gap-1 ${isAdmin ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2'}`}>
            <TabsTrigger value="import" aria-label="Importa Calendario">Importa Calendario</TabsTrigger>
            <TabsTrigger value="odg" aria-label="Ordine del Giorno">ODG</TabsTrigger>
            
            {isAdmin && (
              <>
                <TabsTrigger value="settings" aria-label="Impostazioni">Impostazioni</TabsTrigger>
                <TabsTrigger value="scraper" aria-label="ODG Scraper Manager" className="flex items-center gap-1.5">
                  <Bot className="h-3.5 w-3.5 text-amber-500" />
                  <span>Scraper</span>
                </TabsTrigger>
                <TabsTrigger value="users" aria-label="Gestione Utenti" className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-primary" />
                  <span>Utenti</span>
                </TabsTrigger>
              </>
            )}
          </TabsList>

          {/* TAB 1: IMPORTA CALENDARIO */}
          <TabsContent value="import">
            <TabErrorBoundary tabName="Importa Calendario">
              <ImportaCalendarioTab
                parsedData={parsedData}
                setParsedData={setParsedData}
                isLoading={isDataLoading}
                setIsLoading={setIsDataLoading}
              />
            </TabErrorBoundary>
          </TabsContent>

          {/* TAB 2: ORDINE DEL GIORNO (ODG) */}
          <TabsContent value="odg">
            <TabErrorBoundary tabName="Ordine del Giorno (ODG)">
              <OdgTab />
            </TabErrorBoundary>
          </TabsContent>

          {/* TAB 3: IMPOSTAZIONI (SOLO ADMIN) */}
          {isAdmin && (
            <TabsContent value="settings">
              <TabErrorBoundary tabName="Impostazioni">
                <ImpostazioniTab />
              </TabErrorBoundary>
            </TabsContent>
          )}

          {/* TAB 4: ODG SCRAPER MANAGER (SOLO ADMIN) */}
          {isAdmin && (
            <TabsContent value="scraper">
              <TabErrorBoundary tabName="ODG Scraper (Admin)">
                <ScraperManagerTab />
              </TabErrorBoundary>
            </TabsContent>
          )}

          {/* TAB 5: GESTIONE UTENTI (SOLO ADMIN) */}
          {isAdmin && (
            <TabsContent value="users">
              <TabErrorBoundary tabName="Gestione Utenti (Admin)">
                <GestioneUtentiTab />
              </TabErrorBoundary>
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}
