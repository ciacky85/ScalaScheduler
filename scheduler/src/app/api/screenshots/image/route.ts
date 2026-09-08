import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

function getCandidateShotsDirs(): string[] {
  return [
    '/data/odg_shots',
    path.join(process.cwd(), 'public', 'odg_shots'),
    path.join(process.cwd(), 'odg_shots'),
  ];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const relPath = searchParams.get('path');

    if (!relPath) {
      return new NextResponse('Parametro path mancante', { status: 400 });
    }

    // Normalizza e proteggi da path traversal
    const safeRel = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, '');
    if (!safeRel.endsWith('.png')) {
      return new NextResponse('Formato file non supportato', { status: 400 });
    }

    let foundFile: string | null = null;
    for (const baseDir of getCandidateShotsDirs()) {
      const candidate = path.join(baseDir, safeRel);
      if (existsSync(candidate)) {
        foundFile = candidate;
        break;
      }
    }

    if (!foundFile) {
      return new NextResponse('Immagine non trovata', { status: 404 });
    }

    const imageBuffer = await fs.readFile(foundFile);

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, immutable',
        'Content-Disposition': `inline; filename="${path.basename(foundFile)}"`,
      },
    });
  } catch (err: any) {
    console.error('Error serving screenshot image:', err);
    return new NextResponse('Errore interno caricamento immagine', { status: 500 });
  }
}
