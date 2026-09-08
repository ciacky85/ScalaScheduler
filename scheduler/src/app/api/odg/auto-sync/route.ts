import { NextResponse } from 'next/server';
import { runOdgCalendarSync, logSyncMessage } from '@/lib/calendar/odg-sync';

export async function POST(request: Request) {
  try {
    let dryRun = false;
    let calendarId: string | undefined = undefined;

    try {
      const body = await request.json();
      if (body && typeof body === 'object') {
        dryRun = Boolean(body.dryRun);
        if (body.calendarId && typeof body.calendarId === 'string') {
          calendarId = body.calendarId.trim();
        }
      }
    } catch (_) {
      // Body vuoto o non JSON: procedi con defaults
    }

    await logSyncMessage(`[AUTO-SYNC] Richiesta ricevuta per sincronizzazione automatica ODG.`);
    const result = await runOdgCalendarSync({ calendarId, dryRun });

    if (result.ok) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json(result, { status: 500 });
    }
  } catch (error: any) {
    console.error('Fatal API Error in /api/odg/auto-sync:', error);
    await logSyncMessage(`[FATAL ERROR] Auto-sync fallito inaspettatamente: ${error.message}`);
    return NextResponse.json(
      { ok: false, error: error.message || 'Errore fatale in auto-sync' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    service: 'odg-auto-sync',
    status: 'ready',
    message: 'Invia una richiesta POST per avviare la sincronizzazione automatica su Google Calendar.',
  });
}
