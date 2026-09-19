import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { getLocalVideoDuration, generateThumbnail } from '@/lib/localvideo';
import { MAX_SOURCE_DURATION_SECONDS } from '@/lib/youtube';

const UPLOAD_ROOT = path.join(process.cwd(), 'tmp', 'uploads');
const MAX_UPLOAD_BYTES = 800 * 1024 * 1024; // 800MB — sesuaikan kalau perlu

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('video') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'File video tidak ditemukan.' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Ukuran file terlalu besar (maks ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB).` },
      { status: 400 },
    );
  }

  const uploadId = uuidv4();
  const dir = path.join(UPLOAD_ROOT, uploadId);
  await fs.mkdir(dir, { recursive: true });

  // Selalu disimpan sebagai .mp4 apapun format aslinya — ffmpeg mendeteksi
  // container dari isi file, bukan dari ekstensi, jadi ini aman.
  const videoPath = path.join(dir, 'source.mp4');
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(videoPath, buffer);

  try {
    const durationSeconds = await getLocalVideoDuration(videoPath);
    const thumbPath = path.join(dir, 'thumb.jpg');
    await generateThumbnail(videoPath, thumbPath);
    const thumbnail = `data:image/jpeg;base64,${(await fs.readFile(thumbPath)).toString('base64')}`;

    const allowed = durationSeconds > 0 && durationSeconds <= MAX_SOURCE_DURATION_SECONDS;

    return NextResponse.json({
      uploadId,
      title: path.parse(file.name).name,
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
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    return NextResponse.json({ error: `Gagal membaca file video: ${e.message}` }, { status: 400 });
  }
}
