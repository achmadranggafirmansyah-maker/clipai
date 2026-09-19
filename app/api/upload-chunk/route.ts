import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { getLocalVideoDuration, generateThumbnail } from '@/lib/localvideo';
import { MAX_SOURCE_DURATION_SECONDS } from '@/lib/youtube';

const UPLOAD_ROOT = path.join(process.cwd(), 'tmp', 'uploads');

function isValidUploadId(id: string) {
  return /^[0-9a-f-]{36}$/i.test(id);
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const chunk = form.get('chunk') as File | null;
  const uploadId = String(form.get('uploadId') || '');
  const chunkIndex = Number(form.get('chunkIndex'));
  const totalChunks = Number(form.get('totalChunks'));
  const fileName = String(form.get('fileName') || 'video');

  if (!chunk || !isValidUploadId(uploadId) || Number.isNaN(chunkIndex) || Number.isNaN(totalChunks)) {
    return NextResponse.json({ error: 'Request chunk tidak valid.' }, { status: 400 });
  }

  const dir = path.join(UPLOAD_ROOT, uploadId);
  await fsp.mkdir(dir, { recursive: true });

  // Setiap chunk cuma ~10MB — aman ditampung sebentar di RAM per request,
  // beda dari upload lama yang nampung SELURUH file sekaligus.
  const chunkPath = path.join(dir, `chunk-${chunkIndex}`);
  await fsp.writeFile(chunkPath, Buffer.from(await chunk.arrayBuffer()));

  const isLastChunk = chunkIndex === totalChunks - 1;
  if (!isLastChunk) {
    return NextResponse.json({ done: false });
  }

  // Chunk terakhir diterima — gabungkan semua potongan jadi 1 file video utuh.
  const videoPath = path.join(dir, 'source.mp4');
  try {
    const writeStream = fs.createWriteStream(videoPath);
    for (let i = 0; i < totalChunks; i++) {
      const partPath = path.join(dir, `chunk-${i}`);
      const partBuffer = await fsp.readFile(partPath);
      await new Promise<void>((resolve, reject) => {
        writeStream.write(partBuffer, (err) => (err ? reject(err) : resolve()));
      });
      await fsp.unlink(partPath).catch(() => {});
    }
    await new Promise<void>((resolve) => writeStream.end(resolve));

    const durationSeconds = await getLocalVideoDuration(videoPath);
    const thumbPath = path.join(dir, 'thumb.jpg');
    await generateThumbnail(videoPath, thumbPath);
    const thumbnail = `data:image/jpeg;base64,${(await fsp.readFile(thumbPath)).toString('base64')}`;

    const allowed = durationSeconds > 0 && durationSeconds <= MAX_SOURCE_DURATION_SECONDS;

    return NextResponse.json({
      done: true,
      uploadId,
      title: path.parse(fileName).name,
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
    return NextResponse.json({ error: `Gagal menggabungkan video: ${e.message}` }, { status: 400 });
  }
}
