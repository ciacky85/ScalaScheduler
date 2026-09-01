// src/app/api/calendars/route.ts
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { ImpostazioniCalendario, User } from '@/lib/types';
import { getAllUsers } from '@/lib/auth/users-store';

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

function normalizeCalendar(c: any, usersMap?: Map<string, User>): ImpostazioniCalendario {
  const ownerUserId = String(
    c?.ownerUserId || c?.ownerId || c?.owner_user_id || c?.userId || c?.owner || ''
  ).trim() || undefined;

  let ownerName = c?.ownerName || c?.owner_name || undefined;

  if (ownerUserId && usersMap) {
    const matchedUser = usersMap.get(ownerUserId.toLowerCase());
    if (matchedUser) {
      ownerName = matchedUser.nome;
    }
  }

  return {
    id: String(c?.id || crypto.randomUUID()),
    label: String(c?.label || c?.name || c?.titolo || 'Calendario'),
    calendarId: String(c?.calendarId || c?.calendar_id || c?.id || '').trim(),
    tipo: c?.tipo === 'odg' ? 'odg' : 'importaCalendario',
    predefinito: Boolean(c?.predefinito || c?.default),
    ownerUserId,
    ownerId: ownerUserId,
    ownerName,
  };
}

type CalendarsConfigFile = {
  importaCalendario: any[];
  odg: any[];
};

async function readConfigFile(): Promise<{ importaCalendario: ImpostazioniCalendario[]; odg: ImpostazioniCalendario[] }> {
  const filePath = getResolvedCalendarPath();
  let usersList: User[] = [];
  try {
    usersList = await getAllUsers();
  } catch (_) {}

  // Mappatura per match rapido sia su id, username ed email
  const usersMap = new Map<string, User>();
  for (const u of usersList) {
    if (u.id) usersMap.set(String(u.id).toLowerCase(), u);
    if (u.username) usersMap.set(String(u.username).toLowerCase(), u);
    if (u.email) usersMap.set(String(u.email).toLowerCase(), u);
  }

  try {
    if (existsSync(filePath)) {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(fileContent);

      const importa = Array.isArray(parsed.importaCalendario)
        ? parsed.importaCalendario.map((c: any) => normalizeCalendar(c, usersMap))
        : [];
      const odg = Array.isArray(parsed.odg)
        ? parsed.odg.map((c: any) => normalizeCalendar(c, usersMap))
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
  // Prepariamo i record salvando esplicitamente ownerUserId
  const serializeCalendar = (cal: ImpostazioniCalendario) => ({
    id: cal.id,
    label: cal.label,
    calendarId: cal.calendarId,
    tipo: cal.tipo,
    predefinito: Boolean(cal.predefinito),
    ownerUserId: cal.ownerUserId || cal.ownerId || undefined,
  });

  const importaCalendario = newCalendars.filter((cal) => cal.tipo === 'importaCalendario').map(serializeCalendar);
  const odg = newCalendars.filter((cal) => cal.tipo === 'odg').map(serializeCalendar);

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
