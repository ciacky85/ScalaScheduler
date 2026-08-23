// src/app/api/calendars/route.ts
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import type { ImpostazioniCalendario } from '@/lib/types';

const configPath = path.join(process.cwd(), 'src', 'app', 'config', 'calendars.json');

export async function POST(request: Request) {
    try {
        const newCalendars: ImpostazioniCalendario[] = await request.json();

        if (!Array.isArray(newCalendars)) {
            return NextResponse.json({ ok: false, error: 'Invalid data format: expected an array of calendars.' }, { status: 400 });
        }
        
        // Separa i calendari per tipo
        const calendarsForImport = newCalendars.filter(c => c.tipo === 'importaCalendario');
        const calendarsForOdg = newCalendars.filter(c => c.tipo === 'odg');

        const newConfigFileContent = {
            importaCalendario: calendarsForImport,
            odg: calendarsForOdg
        };

        // Scrivi il file in modo asincrono
        await fs.writeFile(configPath, JSON.stringify(newConfigFileContent, null, 2), 'utf-8');

        return NextResponse.json({ ok: true, message: 'Calendars saved successfully.' });

    } catch (error: any) {
        console.error("API Error in /api/calendars:", error);
        return NextResponse.json(
            { ok: false, error: error.message || 'An unknown error occurred while saving calendars.' },
            { status: 500 }
        );
    }
}
