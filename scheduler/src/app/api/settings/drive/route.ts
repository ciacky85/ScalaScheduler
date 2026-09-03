import { NextResponse } from 'next/server';
import { getDriveConfig, saveDriveConfig, verifyDriveFolderAccess, extractDriveFolderId } from '@/lib/drive/google-drive';

export async function GET() {
  try {
    const config = getDriveConfig();
    return NextResponse.json({ ok: true, config });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || 'Errore durante la lettura della configurazione Drive.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      googleDriveFolderUrl,
      salvaAncheInLocale,
      oauthClientId,
      oauthClientSecret,
      oauthRefreshToken,
      testConnection = false,
    } = body;

    const folderId = extractDriveFolderId(googleDriveFolderUrl);

    let testResult: { ok: boolean; folderName?: string; error?: string } = { ok: true };

    if (testConnection && folderId) {
      testResult = await verifyDriveFolderAccess(folderId);
    }

    const updatedConfig = await saveDriveConfig({
      googleDriveFolderUrl: googleDriveFolderUrl ?? '',
      salvaAncheInLocale: salvaAncheInLocale ?? true,
      ...(oauthClientId ? { oauthClientId } : {}),
      ...(oauthClientSecret ? { oauthClientSecret } : {}),
      ...(oauthRefreshToken ? { oauthRefreshToken } : {}),
    });

    return NextResponse.json({
      ok: true,
      config: updatedConfig,
      testResult,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || 'Errore durante il salvataggio della configurazione Drive.' },
      { status: 500 }
    );
  }
}
