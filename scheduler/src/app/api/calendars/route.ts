// src/app/api/calendars/route.ts
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { ImpostazioniCalendario } from '@/lib/types';

function getCandidateCalendarPaths(): string[] {
  return [
    '/app/config/calendars.json',
    '/app/src/app/config/calendars.json',
    path.join(process.cwd(), 'src', 'app', 'config', 'calendars.json'),
    path.join(process.cwd(), 'config', 'calendars.json'),
  ];
}

function getResolvedCalendarPath(): string {
  for (const p of getCandidateCalendarPaths()) {
    if (existsSync(p)) return p;
  }
  return path.join(process.cwd(), 'src', 'app', 'config', 'calendars.json');
}

function normalizeCalendar(c: any): ImpostazioniCalendario {
  return {
    id: String(c?.id || crypto.randomUUID()),
    label: String(c?.label || c?.name || c?.titolo || 'Calendario'),
    calendarId: String(c?.calendarId || c?.calendar_id || c?.id || '').trim(),
    tipo: c?.tipo === 'odg' ? 'odg' : 'importaCalendario',
    predefinito: Boolean(c?.predefinito || c?.default),
    ownerId: c?.ownerId || c?.owner_id || c?.owner || c?.userId || c?.user || undefined,
    ownerName: c?.ownerName || c?.owner_name || undefined,
  };
}

type CalendarsConfigFile = {
  importaCalendario: ImpostazioniCalendario[];
  odg: ImpostazioniCalendario[];
};

async function readConfigFile(): Promise<CalendarsConfigFile> {
  const filePath = getResolvedCalendarPath();
  try {
    if (existsSync(filePath)) {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(fileContent);

      const importa = Array.isArray(parsed.importaCalendario)
        ? parsed.importaCalendario.map(normalizeCalendar)
        : [];
      const odg = Array.isArray(parsed.odg)
        ? parsed.odg.map(normalizeCalendar)
        : [];

      return {
        importaCalendario: importa,
        odg,
      };
    }
  } catch (error) {
    console.error('[POST /api/calendars] Error reading config file:', error);
  }

  return {
    importaCalendario: [],
    odg: [],
  };
}

async function writeConfigFile(newCalendars: ImpostazioniCalendario[]) {
  const importaCalendario = newCalendars.filter((cal) => cal.tipo === 'importaCalendario').map(normalizeCalendar);
  const odg = newCalendars.filter((cal) => cal.tipo === 'odg').map(normalizeCalendar);

  const payload: CalendarsConfigFile = {
    importaCalendario,
    odg,
  };
  const jsonContent = JSON.stringify(payload, null, 2);

  const localPath = path.join(process.cwd(), 'src', 'app', 'config', 'calendars.json');
  try {
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, jsonContent, 'utf-8');
  } catch (_) {}

  // Copia nei percorsi volume Docker
  const dockerLocations = ['/app/config/calendars.json', '/app/src/app/config/calendars.json'];
  for (const docLoc of dockerLocations) {
    try {
      if (existsSync(path.dirname(docLoc))) {
        await fs.writeFile(docLoc, jsonContent, 'utf-8');
      }
    } catch (_) {}
  }
}

export async function POST(request: Request) {
  try {
    let body: any = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    if (!Array.isArray(body)) {
      const cfg = await readConfigFile();
      const calendars: ImpostazioniCalendario[] = [
        ...cfg.importaCalendario,
        ...cfg.odg,
      ];
      return NextResponse.json({ ok: true, calendars });
    }

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
      { status: 500 }
    );
  }
}
