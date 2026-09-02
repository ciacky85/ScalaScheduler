import { NextResponse } from 'next/server';
import { runScraperNative } from '@/lib/scraper/odg-scraper';
import { syncLocalShotsToDrive } from '@/lib/drive/google-drive';

export async function POST() {
  try {
    const scraperResult = await runScraperNative();
    const driveSyncResult = await syncLocalShotsToDrive();

    return NextResponse.json({
      ok: true,
      result: scraperResult,
      driveSync: driveSyncResult,
    });
  } catch (err: any) {
    console.error('Scraper run error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || 'Errore durante esecuzione scraper' },
      { status: 500 }
    );
  }
}
