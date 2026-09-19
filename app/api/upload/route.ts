import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import Busboy from 'busboy';
import { getLocalVideoDuration, generateThumbnail } from '@/lib/localvideo';
import { MAX_SOURCE_DURATION_SECONDS } from '@/lib/youtube';

const UPLOAD_ROOT = path.join(process.cwd(), 'tmp', 'uploads');
const MAX_UPLOAD_BYTES = 800 * 1024 * 1024; // 800MB

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data') || !req.body) {
    return NextResponse.json({ error: 'Format upload tidak valid.' }, { status: 400 });
  }

  const uploadId = uuidv4();
  const dir = path.join(UPLOAD_ROOT, uploadId);
  await fsp.mkdir(dir, { recursive: true });
  const videoPath = path.join(dir, 'source.mp4');

  let originalFileName = 'video';

  try {
    // Kunci perbaikannya di sini: file langsung ditulis ke disk sepotong-
    // sepotong (streaming) lewat busboy, TIDAK PERNAH ditampung penuh di RAM
    // seperti versi sebelumnya (yang pakai formData()+arrayBuffer()). Ini
    // yang bikin upload video besar (ratusan MB - 1GB+) aman dari OOM.
    await new Promise<void>((resolve, reject) => {
      const busboy = Busboy({
        headers: { 'content-type': contentType },
        limits: { fileSize: MAX_UPLOAD_BYTES },
      });
      let fileHandled = false;

      busboy.on('file', (_name, fileStream, info) => {
        fileHandled = true;
        originalFileName = info.filename || originalFileName;
        const writeStream = fs.createWriteStream(videoPath);
        fileStream.on('limit', () => {
          reject(new Error(`Ukuran file terlalu besar (maks ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB).`));
        });
        fileStream.pipe(writeStream);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      busboy.on('error', reject);
      busboy.on('finish', () => {
        if (!fileHandled) reject(new Error('File video tidak ditemukan.'));
      });

      Readable.fromWeb(req.body as any).pipe(busboy);
    });

    const durationSeconds = await getLocalVideoDuration(videoPath);
    const thumbPath = path.join(dir, 'thumb.jpg');
    await generateThumbnail(videoPath, thumbPath);
    const thumbnail = `data:image/jpeg;base64,${(await fsp.readFile(thumbPath)).toString('base64')}`;

    const allowed = durationSeconds > 0 && durationSeconds <= MAX_SOURCE_DURATION_SECONDS;

    return NextResponse.json({
      uploadId,
      title: path.parse(originalFileName).name,
      thumbnail,
      durationSeconds,
      durationAllowed: allowed,
      warning: allowed
        ? null
        : `Durasi video ${Math.round(durationSeconds / 60)} menit melebihi batas maksimal ${Math.round(
            MAX_SOURCE_DURATION_SECONDS / 60,
          )} menit.`,
    });
  } catch (e: any) {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
    return NextResponse.json({ error: `Gagal upload video: ${e.message}` }, { status: 400 });
  }
}
