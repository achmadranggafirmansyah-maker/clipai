import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { VideoInfo } from './types';

const execFileAsync = promisify(execFile);

const MAX_DURATION_SECONDS = 25 * 60; // batas 25 menit sesuai aturan produk

// Kalau YouTube nge-block IP server (umum banget untuk IP cloud/datacenter),
// yt-dlp butuh cookies dari akun yang sudah login supaya dianggap bukan bot.
// Cookies disimpan di env var (base64) supaya tidak perlu commit file sensitif
// ke repo, lalu ditulis ke disk sekali di awal proses.
let cookiesFilePath: string | null | undefined; // undefined = belum dicek

function getCookiesFilePath(): string | null {
  if (cookiesFilePath !== undefined) return cookiesFilePath;

  const b64 = process.env.YT_COOKIES_B64;
  if (!b64) {
    cookiesFilePath = null;
    return null;
  }

  const filePath = path.join(os.tmpdir(), 'yt-cookies.txt');
  fs.writeFileSync(filePath, Buffer.from(b64, 'base64'));
  cookiesFilePath = filePath;
  return filePath;
}

// Beberapa "penyamaran" client YouTube dicoba berurutan. Kalau satu keblokir
// (YouTube suka gonta-ganti client mana yang lagi dibolehin/diblokir dari cloud
// IP), otomatis lanjut coba client berikutnya sebelum benar-benar menyerah.
const CLIENT_FALLBACKS = ['android', 'ios', 'tv_embedded', 'web'];
const YOUTUBE_ID_REGEX = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{11})/;

function extractVideoId(url: string): string | null {
  const match = url.match(YOUTUBE_ID_REGEX);
  return match ? match[1] : null;
}

function parseIso8601Duration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const [, h, m, s] = match;
  return Number(h || 0) * 3600 + Number(m || 0) * 60 + Number(s || 0);
}

// Jalur utama: API resmi YouTube. Tidak pernah kena "sign in to confirm
// you're not a bot" karena ini bukan scraping — resmi disediakan Google.
async function getVideoInfoViaOfficialApi(videoId: string): Promise<VideoInfo | null> {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status&id=${videoId}&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const item = data.items?.[0];
    if (!item) return null;

    const thumbs = item.snippet.thumbnails;
    const thumbnail =
      thumbs.maxres?.url || thumbs.standard?.url || thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url;

    return {
      id: videoId,
      title: item.snippet.title,
      thumbnail,
      durationSeconds: parseIso8601Duration(item.contentDetails.duration),
      isPrivateOrUnlisted: item.status?.privacyStatus ? item.status.privacyStatus !== 'public' : false,
    };
  } catch {
    return null; // biar jatuh ke fallback yt-dlp di bawah
  }
}

async function runYtDlp(args: string[]): Promise<string> {
  const errors: string[] = [];

  const url = args[args.length - 1];
  const baseArgs = args.slice(0, -1);

  const cookies = getCookiesFilePath();
  const cookieArgs = cookies ? ['--cookies', cookies] : [];

  const potUrl = process.env.POT_PROVIDER_URL;
  const potArgs = potUrl ? ['--extractor-args', `youtubepot-bgutilhttp:base_url=${potUrl}`] : [];

  for (const client of CLIENT_FALLBACKS) {
    try {
      const { stdout } = await execFileAsync(
        'yt-dlp',
        [...baseArgs, ...cookieArgs, ...potArgs, '--extractor-args', `youtube:player_client=${client}`, url],
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
  const videoId = extractVideoId(youtubeUrl);

  if (videoId) {
    const officialInfo = await getVideoInfoViaOfficialApi(videoId);
    if (officialInfo) return officialInfo;
  }

  // Fallback: cuma dipakai kalau YOUTUBE_DATA_API_KEY belum di-set,
  // atau videonya kasus khusus yang nggak kebaca lewat API resmi.
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
