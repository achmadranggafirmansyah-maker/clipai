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

function buildFilterComplex(splitMoments: { start: number; end: number }[]) {
  const hasSplit = splitMoments.length > 0;
  const enableExpr = toBetweenExpr(splitMoments);

  const parts: string[] = [];

  parts.push(`[0:v]setpts=PTS-STARTPTS,split=${hasSplit ? 3 : 2}[bgin][fgin]${hasSplit ? '[spin]' : ''}`);

  parts.push(
    `[bgin]scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=increase,crop=${OUT_W}:${OUT_H},boxblur=24:24[bg]`,
  );

  const zoomedW = Math.round(OUT_W * FG_ZOOM);
  parts.push(
    `[fgin]scale=${zoomedW}:-2,crop=${OUT_W}:min(ih\\,${OUT_H})[fg]`,
  );
  parts.push(`[bg][fg]overlay=(W-w)/2:(H-h)/2[normal]`);

  let lastLabel = 'normal';

  if (hasSplit) {
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
  const srtFileName = `clip-${index}.srt`;
  const srtPath = path.join(outDir, srtFileName);
  await fs.writeFile(srtPath, srtContent || '1\n00:00:00,000 --> 00:00:01,000\n \n', 'utf-8');
  return srtFileName; // sengaja return nama file doang (relatif), bukan path lengkap
}

interface RenderParams {
  sourcePath: string;
  clip: ClipPlan;
  outDir: string;
}

export async function renderClip({ sourcePath, clip, outDir }: RenderParams): Promise<string> {
  await fs.mkdir(outDir, { recursive: true });

  const duration = clip.endSeconds - clip.startSeconds;
  const srtFileName = await writeSrtFile(clip.transcriptSrt, outDir, clip.index);
  const outputPath = path.join(outDir, `clip-${clip.index}.mp4`);

  const { filter, outputLabel } = buildFilterComplex(clip.splitScreenMoments);

  // pakai nama file relatif (bukan path panjang) supaya ffmpeg nggak rewel baca subtitle-nya
  const fullFilter = `${filter};[${outputLabel}]subtitles=${srtFileName}:force_style='FontName=Arial,FontSize=15,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Alignment=2,MarginV=90'[final]`;

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

  // cwd di-set ke outDir supaya nama file relatif di atas ke-resolve dengan benar
  await execFileAsync('ffmpeg', args, { cwd: outDir, maxBuffer: 1024 * 1024 * 50 });

  return outputPath;
}
