import { NextResponse } from 'next/server';
import { runScraperNative } from '@/lib/scraper/odg-scraper';

export async function POST() {
  try {
    const result = await runScraperNative();
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    console.error('Scraper run error:', err);
    return NextResponse.json({ ok: false, error: err.message || 'Errore durante esecuzione scraper' }, { status: 500 });
  }
}
