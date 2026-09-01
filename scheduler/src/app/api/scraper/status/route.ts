import { NextResponse } from 'next/server';
import { getScraperStatus } from '@/lib/scraper/odg-scraper';

export async function GET() {
  try {
    const status = await getScraperStatus();
    return NextResponse.json({ ok: true, status });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || 'Errore lettura stato scraper' }, { status: 500 });
  }
}
