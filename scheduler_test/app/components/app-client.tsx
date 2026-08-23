'use client';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ImpostazioniTab from '@/app/components/impostazioni-tab';
import ImportaCalendarioTab from '@/app/components/importa-calendario-tab';
import OdgTab from './odg-tab';
import { CalendarDays } from 'lucide-react';
import type { ImpostazioniCalendario, RigaCalendario } from '@/lib/types';
import { SettingsProvider } from '@/contexts/settings-context';
import { CalendarProvider } from '@/contexts/calendar-context';

interface AppClientProps {
  initialCalendars: ImpostazioniCalendario[];
}

export default function AppClient({ initialCalendars }: AppClientProps) {
  const [parsedData, setParsedData] = useState<{
    mese: string;
    anno: number;
    righe: RigaCalendario[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  return (
    <CalendarProvider initialCalendars={initialCalendars}>
      <SettingsProvider>
        <div className="flex min-h-screen w-full flex-col bg-background">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 sm:px-6">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-headline font-semibold">Chorus Calendar Sync</h1>
            </div>
          </header>
          <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
            <Tabs defaultValue="import" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="import" aria-label="Importa Calendario">Importa Calendario</TabsTrigger>
                <TabsTrigger value="odg" aria-label="Ordine del Giorno">ODG</TabsTrigger>
                <TabsTrigger value="settings" aria-label="Impostazioni">Impostazioni</TabsTrigger>
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
            </Tabs>
          </main>
        </div>
      </SettingsProvider>
    </CalendarProvider>
  );
}
