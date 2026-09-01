import { NextResponse } from 'next/server';
import { loadScraperConfig, saveScraperConfig } from '@/lib/scraper/odg-scraper';

export async function GET() {
  try {
    const { config, filePath } = await loadScraperConfig();
    return NextResponse.json({ ok: true, config, filePath });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || 'Errore lettura config scraper' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { config, savedPath } = await saveScraperConfig(body);
    return NextResponse.json({ ok: true, config, savedPath });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || 'Errore salvataggio config scraper' }, { status: 500 });
  }
}
