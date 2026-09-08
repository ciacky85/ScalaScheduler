import { NextResponse } from 'next/server';
import { runOdgCalendarSync, logSyncMessage } from '@/lib/calendar/odg-sync';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { calendarId, dryRun = false } = body;

    const result = await runOdgCalendarSync({ calendarId, dryRun });

    if (result.ok) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json(
        { ok: false, error: result.error, stats: result.stats, details: result.details, where: result.where },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Fatal API Error in /api/odg/push:', error);
    await logSyncMessage(`[FATAL ERROR] Push job fallito inaspettatamente: ${error.message}`);
    return NextResponse.json(
      { ok: false, error: error.message || 'Si è verificato un errore fatale nel gestore push.' },
      { status: 500 }
    );
  }
}
