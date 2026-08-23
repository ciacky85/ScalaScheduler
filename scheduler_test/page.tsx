import fs from 'fs/promises';
import path from 'path';
import type { ImpostazioniCalendario } from '@/lib/types';
import AppClient from './components/app-client';

async function loadCalendars(): Promise<ImpostazioniCalendario[]> {
  try {
    const configPath = path.join(process.cwd(), 'src', 'app', 'config', 'calendars.json');
    const fileContent = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(fileContent);
    // Combina i calendari dai due array nel file di configurazione
    return [...(config.importaCalendario || []), ...(config.odg || [])];
  } catch (error) {
    console.error("Failed to load calendars configuration, returning empty array:", error);
    // In caso di errore (es. file non trovato), restituisce un array vuoto per evitare crash
    return [];
  }
}


export default async function Home() {
  const initialCalendars = await loadCalendars();
  return <AppClient initialCalendars={initialCalendars} />;
}
