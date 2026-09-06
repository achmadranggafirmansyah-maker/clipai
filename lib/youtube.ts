import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { VideoInfo } from './types';

const execFileAsync = promisify(execFile);

const MAX_DURATION_SECONDS = 25 * 60; // batas 25 menit sesuai aturan produk

// Beberapa "penyamaran" client YouTube dicoba berurutan. Kalau satu keblokir
// (YouTube suka gonta-ganti client mana yang lagi dibolehin/diblokir dari cloud
// IP), otomatis lanjut coba client berikutnya sebelum benar-benar menyerah.
const CLIENT_FALLBACKS = ['android', 'ios', 'tv_embedded', 'web'];

async function runYtDlp(args: string[]): Promise<string> {
  const errors: string[] = [];

  // URL selalu jadi argumen terakhir di semua pemanggilan kita; sisipkan
  // --extractor-args sebelum URL supaya urutannya aman buat yt-dlp.
  const url = args[args.length - 1];
  const baseArgs = args.slice(0, -1);

  for (const client of CLIENT_FALLBACKS) {
    try {
      const { stdout } = await execFileAsync(
        'yt-dlp',
        [...baseArgs, '--extractor-args', `youtube:player_client=${client}`, url],
        { maxBuffer: 1024 * 1024 * 50 },
      );
      return stdout;
    } catch (e: any) {
      const msg = (e.stderr || e.message || 'unknown error').toString().trim();
      errors.push(`[${client}] ${msg.split('\n').slice(-1)[0]}`);
    }
  }

  throw new Error(
    `YouTube menolak semua percobaan akses (${CLIENT_FALLBACKS.join(', ')}). Detail: ${errors.join(' | ')}`,
  );
}

/**
 * Ambil metadata video (judul, thumbnail, durasi) tanpa mendownload filenya.
 * Dipakai untuk preview thumbnail di step 2 sebelum user lanjut proses.
 */
export async function getVideoInfo(youtubeUrl: string): Promise<VideoInfo> {
  const stdout = await runYtDlp([
    '--dump-single-json',
    '--no-warnings',
    '--no-playlist',
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

  await runYtDlp([
    '-f',
    'bestvideo[height<=720]+bestaudio/best[height<=720]',
    '--merge-output-format',
    'mp4',
    '--no-playlist',
    '-o',
    outPath,
    youtubeUrl,
  ]);

  return outPath;
}

export const MAX_SOURCE_DURATION_SECONDS = MAX_DURATION_SECONDS;
