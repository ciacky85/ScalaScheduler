// src/app/api/calendars/route.ts
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import type { ImpostazioniCalendario } from '@/lib/types';

const configPath = path.join(process.cwd(), 'src', 'app', 'config', 'calendars.json');

type CalendarsConfigFile = {
  importaCalendario: ImpostazioniCalendario[];
  odg: ImpostazioniCalendario[];
};

async function readConfigFile(): Promise<CalendarsConfigFile> {
  try {
    const fileContent = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(fileContent);

    return {
      importaCalendario: Array.isArray(parsed.importaCalendario)
        ? parsed.importaCalendario
        : [],
      odg: Array.isArray(parsed.odg) ? parsed.odg : [],
    };
  } catch (error) {
    console.error('[POST /api/calendars] Error reading config file:', error);
    // In caso di errore restituiamo comunque una struttura vuota
    return {
      importaCalendario: [],
      odg: [],
    };
  }
}

async function writeConfigFile(newCalendars: ImpostazioniCalendario[]) {
  const importaCalendario = newCalendars.filter(
    (cal) => cal.tipo === 'importaCalendario',
  );
  const odg = newCalendars.filter((cal) => cal.tipo === 'odg');

  const newConfigFileContent: CalendarsConfigFile = {
    importaCalendario,
    odg,
  };

  await fs.writeFile(
    configPath,
    JSON.stringify(newConfigFileContent, null, 2),
    'utf-8',
  );

  console.log(
    `[POST /api/calendars] Saved ${importaCalendario.length} importaCalendario and ${odg.length} odg calendars to`,
    configPath,
  );
}

// Usiamo SOLO POST, che gestisce sia LOAD che SAVE
export async function POST(request: Request) {
  try {
    let body: any = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    // --- MODALITÀ LOAD: nessun body o body NON array ---
    if (!Array.isArray(body)) {
      console.log('[POST /api/calendars] LOAD calendars (no array in body)');
      const cfg = await readConfigFile();
      const calendars: ImpostazioniCalendario[] = [
        ...cfg.importaCalendario,
        ...cfg.odg,
      ];
      return NextResponse.json({ ok: true, calendars });
    }

    // --- MODALITÀ SAVE: body è un array di calendari ---
    const newCalendars: ImpostazioniCalendario[] = body;
    await writeConfigFile(newCalendars);

    return NextResponse.json({
      ok: true,
      message: 'Calendars saved successfully.',
    });
  } catch (error: any) {
    console.error('[POST /api/calendars] Error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'An unknown error occurred while handling calendars.',
      },
      { status: 500 },
    );
  }
}

// NESSUN GET: il tuo ambiente risponde 405 comunque; tanto usiamo solo POST dal client
