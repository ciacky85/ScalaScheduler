import { NextResponse } from 'next/server';
import { getDriveConfig, uploadScreenshotToDrive } from '@/lib/drive/google-drive';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  try {
    const config = getDriveConfig();
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const customName = formData.get('filename') as string | null;

    if (!file) {
      return NextResponse.json({ ok: false, error: 'Nessun file fornito.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = customName || file.name || `screenshot_${Date.now()}.png`;
    const mimeType = file.type || 'image/png';

    let localPath: string | undefined = undefined;

    // 1. Se configurato, salva in locale
    if (config.salvaAncheInLocale) {
      const localDir = path.join(process.cwd(), 'public', 'odg_shots');
      const fullPath = path.join(localDir, fileName);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, buffer);
      localPath = `/odg_shots/${fileName.replace(/\\/g, '/')}`;
    }

    // 2. Carica su Google Drive se la cartella è configurata
    let driveResult: { ok: boolean; fileId?: string; webViewLink?: string; error?: string } = {
      ok: false,
      error: 'Google Drive non configurato.',
    };

    if (config.googleDriveFolderId) {
      driveResult = await uploadScreenshotToDrive(buffer, fileName, mimeType, config.googleDriveFolderId);
    }

    return NextResponse.json({
      ok: true,
      fileName,
      savedLocally: config.salvaAncheInLocale,
      localPath,
      driveResult,
    });
  } catch (error: any) {
    console.error('Screenshot upload error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Errore durante l\'elaborazione dello screenshot.' },
      { status: 500 }
    );
  }
}
