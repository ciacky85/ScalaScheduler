import { NextResponse } from 'next/server';
import { runScraperNative } from '@/lib/scraper/odg-scraper';
import { syncLocalShotsToDrive } from '@/lib/drive/google-drive';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export async function POST() {
  try {
    // Segnala al container Python Playwright di eseguire lo scatto immediato degli screenshot
    const triggerCandidates = [
      path.join(process.cwd(), 'public', 'trigger_run'),
      '/app/public/trigger_run',
      '/data/trigger_run',
    ];
    for (const tp of triggerCandidates) {
      try {
        if (existsSync(path.dirname(tp))) {
          await fs.writeFile(tp, Date.now().toString(), 'utf-8');
        }
      } catch (_) {}
    }

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
