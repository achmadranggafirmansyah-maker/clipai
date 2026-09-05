import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const OUTPUT_ROOT = path.join(process.cwd(), 'public', 'outputs');

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string; filename: string } }
) {
  const { jobId, filename } = params;

  if (jobId.includes('..') || filename.includes('..')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const filePath = path.join(OUTPUT_ROOT, jobId, filename);

  try {
    const fileBuffer = await fs.readFile(filePath);
    const isDownload = req.nextUrl.searchParams.get('download') === '1';

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(fileBuffer.length),
        'Cache-Control': 'no-store',
        ...(isDownload
          ? { 'Content-Disposition': `attachment; filename="${filename}"` }
          : {}),
      },
    });
  } catch {
    return NextResponse.json({ error: 'File tidak ditemukan' }, { status: 404 });
  }
}
