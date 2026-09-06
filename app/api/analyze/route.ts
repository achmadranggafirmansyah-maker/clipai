import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createJob } from '@/lib/jobs';
import { startJob } from '@/lib/pipeline';
import { DEFAULT_STYLE } from '@/lib/ffmpeg';

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { apiKey, youtubeUrl, briefUrl, clipCount, blurIntensity, overlayPosX, overlayPosY, overlayZoom } = body;

  if (!apiKey || !youtubeUrl) {
    return NextResponse.json({ error: 'API key & URL YouTube wajib diisi.' }, { status: 400 });
  }
  const count = Math.min(8, Math.max(5, Number(clipCount) || 6));

  const style = {
    blurIntensity: clamp(Number(blurIntensity ?? DEFAULT_STYLE.blurIntensity), 0, 100),
    overlayPosX: clamp(Number(overlayPosX ?? DEFAULT_STYLE.overlayPosX), -100, 100),
    overlayPosY: clamp(Number(overlayPosY ?? DEFAULT_STYLE.overlayPosY), -100, 100),
    overlayZoom: clamp(Number(overlayZoom ?? DEFAULT_STYLE.overlayZoom), 100, 250),
  };

  const jobId = uuidv4();
  createJob(jobId);

  // dijalankan di background, endpoint langsung balas jobId supaya
  // frontend bisa polling status tanpa request nge-hang lama
  startJob({
    jobId,
    apiKey,
    youtubeUrl,
    briefUrl: briefUrl || '',
    clipCount: count,
    maxClipSeconds: 60,
    style,
  }).catch(() => {
    /* error sudah ditangani & disimpan di dalam startJob */
  });

  return NextResponse.json({ jobId });
}
