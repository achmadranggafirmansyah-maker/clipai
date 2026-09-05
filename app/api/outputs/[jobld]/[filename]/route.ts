import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const OUTPUT_ROOT = path.join(process.cwd(), 'public', 'outputs');

export async function GET(
  req: NextRequest,
  context: { params: { jobId?: string; filename?: string } },
) {
  const jobId = context?.params?.jobId;
  const filename = context?.params?.filename;

  if (!jobId || !filename) {
    console.error('outputs route: params kosong', { jobId, filename, url: req.url });
    return NextResponse.json({ error: 'Parameter jobId/filename kosong' }, { status: 400 });
  }

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
  } catch (e) {
    console.error('outputs route: gagal baca file', filePath, e);
    return NextResponse.json({ error: 'File tidak ditemukan' }, { status: 404 });
  }
}
