import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { ClipPlan } from './types';

const execFileAsync = promisify(execFile);

// Kanvas output portrait, di-cap di 720p (720x1280) sesuai aturan produk.
const OUT_W = 720;
const OUT_H = 1280;
// Seberapa banyak layer foreground di-zoom supaya area kosong di kiri-kanan
// video asli (yang biasanya 16:9) makin tidak kelihatan & fokus ke orangnya.
const FG_ZOOM = 1.4;

function toBetweenExpr(moments: { start: number; end: number }[]): string {
  if (!moments.length) return '0';
  return moments
    .map((m) => `between(t,${Math.max(0, m.start)},${Math.max(0, m.end)})`)
    .join('+');
}

/**
 * Style #1: Blur Background.
 * - Layer utama: blur penuh 720x1280 (background).
 * - Layer overlay: video asli di-zoom supaya lebih fokus ke orang, ditumpuk di tengah.
 * - Saat ada momen splitScreenMoments (video podcast 2 kamera), background blur
 *   "hilang" karena ditutup penuh oleh layer split-screen (kiri/kanan jadi atas/bawah).
 */
function buildFilterComplex(splitMoments: { start: number; end: number }[]) {
  const hasSplit = splitMoments.length > 0;
  const enableExpr = toBetweenExpr(splitMoments);

  const parts: string[] = [];

  parts.push(`[0:v]setpts=PTS-STARTPTS,split=${hasSplit ? 3 : 2}[bgin][fgin]${hasSplit ? '[spin]' : ''}`);

  // Background: crop-fill + blur
  parts.push(
    `[bgin]scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=increase,crop=${OUT_W}:${OUT_H},boxblur=24:24[bg]`,
  );

  // Foreground: zoom in supaya area kosong makin tidak terlihat, lalu overlay di tengah
  const zoomedW = Math.round(OUT_W * FG_ZOOM);
  parts.push(
    `[fgin]scale=${zoomedW}:-2,crop=${OUT_W}:min(ih\\,${OUT_H})[fg]`,
  );
  parts.push(`[bg][fg]overlay=(W-w)/2:(H-h)/2[normal]`);

  let lastLabel = 'normal';

  if (hasSplit) {
    // Pecah frame asli jadi kiri & kanan (dua orang), lalu tumpuk atas-bawah
    parts.push(`[spin]split=2[spinL0][spinR0]`);
    parts.push(
      `[spinL0]crop=iw/2:ih:0:0,scale=${OUT_W}:${Math.round(OUT_H / 2)}[spinL]`,
    );
    parts.push(
      `[spinR0]crop=iw/2:ih:iw/2:0,scale=${OUT_W}:${Math.round(OUT_H / 2)}[spinR]`,
    );
    parts.push(`[spinL][spinR]vstack=2[splitfull]`);
    parts.push(
      `[normal][splitfull]overlay=0:0:enable='${enableExpr}'[vout]`,
    );
    lastLabel = 'vout';
  }

  return { filter: parts.join(';'), outputLabel: lastLabel };
}

async function writeSrtFile(srtContent: string, outDir: string, index: number) {
  const srtPath = path.join(outDir, `clip-${index}.srt`);
  await fs.writeFile(srtPath, srtContent || '1\n00:00:00,000 --> 00:00:01,000\n \n', 'utf-8');
  return srtPath;
}

interface RenderParams {
  sourcePath: string;
  clip: ClipPlan;
  outDir: string;
}

/**
 * Render satu clip. HARUS dipanggil satu-satu (sequential) oleh caller,
 * jangan di-Promise.all-kan, sesuai aturan produk (tidak render paralel).
 */
export async function renderClip({ sourcePath, clip, outDir }: RenderParams): Promise<string> {
  await fs.mkdir(outDir, { recursive: true });

  const duration = clip.endSeconds - clip.startSeconds;
  const srtPath = await writeSrtFile(clip.transcriptSrt, outDir, clip.index);
  const outputPath = path.join(outDir, `clip-${clip.index}.mp4`);

  const { filter, outputLabel } = buildFilterComplex(clip.splitScreenMoments);

  // subtitle wajib selalu aktif (tombol auto caption permanen ON) -> selalu di-burn
  const escapedSrt = srtPath.replace(/:/g, '\\:');
  const fullFilter = `${filter};[${outputLabel}]subtitles='${escapedSrt}':force_style='FontName=Arial,FontSize=15,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Alignment=2,MarginV=90'[final]`;

  const args = [
    '-y',
    '-ss', String(clip.startSeconds),
    '-to', String(clip.endSeconds),
    '-i', sourcePath,
    '-filter_complex', fullFilter,
    '-map', '[final]',
    '-map', '0:a?',
    '-t', String(duration),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '21',
    '-c:a', 'aac',
    '-b:a', '128k',
    outputPath,
  ];

  await execFileAsync('ffmpeg', args, { maxBuffer: 1024 * 1024 * 50 });

  return outputPath;
}
