import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** Baca durasi video lokal pakai ffprobe (bagian dari paket ffmpeg yang sudah terinstall). */
export async function getLocalVideoDuration(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  return Math.round(parseFloat(stdout.trim()) || 0);
}

/** Ambil 1 frame di detik ke-1 sebagai thumbnail preview. */
export async function generateThumbnail(filePath: string, outPath: string): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-y',
    '-i', filePath,
    '-ss', '1',
    '-frames:v', '1',
    '-vf', 'scale=480:-1',
    outPath,
  ]);
}
