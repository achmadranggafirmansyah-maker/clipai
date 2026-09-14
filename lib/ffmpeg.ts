import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { ClipPlan } from './types';

const execFileAsync = promisify(execFile);

// Kanvas output portrait, di-cap di 720p (720x1280) sesuai aturan produk.
const OUT_W = 720;
const OUT_H = 1280;

export interface StyleOptions {
  blurIntensity: number; // 0-100, 0 = background nggak diblur sama sekali
  overlayPosX: number; // -100..100, 0 = tengah
  overlayPosY: number; // -100..100, 0 = tengah
  overlayZoom: number; // persen, mis. 140 = 1.4x
}

export const DEFAULT_STYLE: StyleOptions = {
  blurIntensity: 60,
  overlayPosX: 0,
  overlayPosY: 0,
  overlayZoom: 100,
};

function buildFilterComplex(style: StyleOptions) {
  const parts: string[] = [];
  parts.push(`[0:v]setpts=PTS-STARTPTS,split=2[bgin][fgin]`);

  const blurRadius = Math.round((style.blurIntensity / 100) * 40);
  const bgBase = `[bgin]scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=increase,crop=${OUT_W}:${OUT_H}`;
  parts.push(blurRadius > 0 ? `${bgBase},boxblur=${blurRadius}:${blurRadius}[bg]` : `${bgBase}[bg]`);

  const zoomedW = Math.round(OUT_W * (style.overlayZoom / 100));
  parts.push(`[fgin]scale=${zoomedW}:-2[fg]`);

  const fx = (style.overlayPosX / 100).toFixed(3);
  const fy = (style.overlayPosY / 100).toFixed(3);
  const overlayX = `(W-w)/2*(1+(${fx}))`;
  const overlayY = `(H-h)/2*(1+(${fy}))`;
  parts.push(`[bg][fg]overlay=${overlayX}:${overlayY}[vout]`);

  return { filter: parts.join(';'), outputLabel: 'vout' };
}

interface RenderParams {
  sourcePath: string;
  clip: ClipPlan;
  outDir: string;
  style: StyleOptions;
}

export async function renderClip({ sourcePath, clip, outDir, style }: RenderParams): Promise<string> {
  await fs.mkdir(outDir, { recursive: true });

  const duration = clip.endSeconds - clip.startSeconds;
  const outputPath = path.join(outDir, `clip-${clip.index}.mp4`);

  const { filter, outputLabel } = buildFilterComplex(style);

  const args = [
    '-y',
    '-ss', String(clip.startSeconds),
    '-to', String(clip.endSeconds),
    '-i', sourcePath,
    '-filter_complex', filter,
    '-map', `[${outputLabel}]`,
    '-map', '0:a?',
    '-t', String(duration),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '21',
    '-c:a', 'aac',
    '-b:a', '128k',
    outputPath,
  ];

  await execFileAsync('ffmpeg', args, { cwd: outDir, maxBuffer: 1024 * 1024 * 50 });

  return outputPath;
}
