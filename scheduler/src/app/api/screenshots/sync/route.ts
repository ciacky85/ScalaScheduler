import { NextResponse } from 'next/server';
import { syncLocalShotsToDrive } from '@/lib/drive/google-drive';

export async function POST() {
  try {
    const result = await syncLocalShotsToDrive();
    return NextResponse.json({ ok: result.ok, result });
  } catch (error: any) {
    console.error('Screenshot sync error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Errore durante la sincronizzazione su Google Drive.' },
      { status: 500 }
    );
  }
}
