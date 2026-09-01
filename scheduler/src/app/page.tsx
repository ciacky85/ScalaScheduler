'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ImpostazioniTab from '@/app/components/impostazioni-tab';
import ImportaCalendarioTab from '@/app/components/importa-calendario-tab';
import OdgTab from '@/app/components/odg-tab';
import ScraperManagerTab from '@/app/components/scraper-manager-tab';
import GestioneUtentiTab from '@/app/components/admin/gestione-utenti-tab';
import LoginDialog from '@/app/components/auth/login-dialog';
import { TabErrorBoundary } from '@/app/components/error-boundary';
import { useAuth } from '@/contexts/auth-context';
import { CalendarDays, Bot, Users, LogIn, LogOut, User, Shield, Lock } from 'lucide-react';
import type { RigaCalendario } from '@/lib/types';

export default function Home() {
  const { user, isLoading, isAdmin, logout } = useAuth();
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  const [parsedData, setParsedData] = useState<{
    mese: string;
    anno: number;
    righe: RigaCalendario[];
  } | null>(null);
  const [isDataLoading, setIsDataLoading] = useState(false);

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

        {/* User Status / Login Button */}
        <div className="flex items-center gap-3">
          {isLoading ? (
            <div className="h-8 w-24 bg-muted animate-pulse rounded" />
          ) : user ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2 bg-muted/60 py-1 px-2.5 rounded-full text-xs">
                {user.role === 'admin' ? (
                  <Shield className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
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
          ) : (
            <Button
              size="sm"
              onClick={() => setIsLoginOpen(true)}
              className="h-8 text-xs flex items-center gap-1.5"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Accedi / Registrati</span>
            </Button>
          )}
        </div>
      </header>

      {/* CONTENUTO PRINCIPALE */}
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <Tabs defaultValue="import" className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 gap-1">
            <TabsTrigger value="import" aria-label="Importa Calendario">Importa Calendario</TabsTrigger>
            <TabsTrigger value="odg" aria-label="Ordine del Giorno">ODG</TabsTrigger>
            <TabsTrigger value="settings" aria-label="Impostazioni">Impostazioni</TabsTrigger>
            
            {isAdmin && (
              <>
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

          {/* TAB 3: IMPOSTAZIONI */}
          <TabsContent value="settings">
            <TabErrorBoundary tabName="Impostazioni">
              <ImpostazioniTab />
            </TabErrorBoundary>
          </TabsContent>

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

      {/* LOGIN & REGISTER MODAL */}
      <LoginDialog open={isLoginOpen} onOpenChange={setIsLoginOpen} />
    </div>
  );
}
