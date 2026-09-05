import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { VideoInfo } from './types';

const execFileAsync = promisify(execFile);

const MAX_DURATION_SECONDS = 25 * 60; // batas 25 menit sesuai aturan produk

/**
 * Ambil metadata video (judul, thumbnail, durasi) tanpa mendownload filenya.
 * Dipakai untuk preview thumbnail di step 2 sebelum user lanjut proses.
 */
export async function getVideoInfo(youtubeUrl: string): Promise<VideoInfo> {
  const { stdout } = await execFileAsync('yt-dlp', [
    '--dump-single-json',
    '--no-warnings',
    '--no-playlist',
    '--extractor-args', 'youtube:player_client=android,web',
    youtubeUrl,
  ]);

  const data = JSON.parse(stdout);
  const durationSeconds = Math.round(data.duration ?? 0);

  return {
    id: data.id,
    title: data.title,
    thumbnail: data.thumbnail,
    durationSeconds,
    isPrivateOrUnlisted: data.availability
      ? data.availability !== 'public'
      : false,
  };
}

export function isDurationAllowed(durationSeconds: number): boolean {
  return durationSeconds > 0 && durationSeconds <= MAX_DURATION_SECONDS;
}

/**
 * Download video ke folder kerja (tmp/{jobId}/source.mp4).
 * Dibatasi ke resolusi <=720p supaya proses render lebih cepat & sesuai
 * batas output produk (output final juga di-cap 720p di tahap ffmpeg).
 */
export async function downloadVideo(
  youtubeUrl: string,
  outDir: string,
): Promise<string> {
  const outPath = path.join(outDir, 'source.mp4');

  await execFileAsync(
    'yt-dlp',
    [
      '-f',
      'bestvideo[height<=720]+bestaudio/best[height<=720]',
      '--merge-output-format',
      'mp4',
      '--no-playlist',
      '--extractor-args', 'youtube:player_client=android,web',
      '-o',
      outPath,
      youtubeUrl,
    ],
    { maxBuffer: 1024 * 1024 * 50 },
  );

  return outPath;
}

export const MAX_SOURCE_DURATION_SECONDS = MAX_DURATION_SECONDS;
