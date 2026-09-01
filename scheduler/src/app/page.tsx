'use client';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ImpostazioniTab from '@/app/components/impostazioni-tab';
import ImportaCalendarioTab from '@/app/components/importa-calendario-tab';
import OdgTab from '@/app/components/odg-tab';
import ScraperManagerTab from '@/app/components/scraper-manager-tab';
import { CalendarDays, Bot } from 'lucide-react';
import type { RigaCalendario } from '@/lib/types';

export default function Home() {
  const [parsedData, setParsedData] = useState<{
    mese: string;
    anno: number;
    righe: RigaCalendario[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-headline font-semibold">Chorus Calendar Sync</h1>
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <Tabs defaultValue="import" className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 gap-1">
            <TabsTrigger value="import" aria-label="Importa Calendario">Importa Calendario</TabsTrigger>
            <TabsTrigger value="odg" aria-label="Ordine del Giorno">ODG</TabsTrigger>
            <TabsTrigger value="settings" aria-label="Impostazioni">Impostazioni</TabsTrigger>
            <TabsTrigger value="scraper" aria-label="ODG Scraper Manager" className="flex items-center gap-1.5">
              <Bot className="h-3.5 w-3.5 text-amber-500" />
              <span>Scraper (Admin)</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="import">
            <ImportaCalendarioTab
              parsedData={parsedData}
              setParsedData={setParsedData}
              isLoading={isLoading}
              setIsLoading={setIsLoading}
            />
          </TabsContent>
          <TabsContent value="odg">
            <OdgTab />
          </TabsContent>
          <TabsContent value="settings">
            <ImpostazioniTab />
          </TabsContent>
          <TabsContent value="scraper">
            <ScraperManagerTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

