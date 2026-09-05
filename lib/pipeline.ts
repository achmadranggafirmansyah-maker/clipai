import path from 'path';
import fs from 'fs/promises';
import { getVideoInfo, isDurationAllowed, downloadVideo } from './youtube';
import { fetchBriefText } from './brief';
import { analyzeVideoForClips } from './gemini';
import { renderClip } from './ffmpeg';
import { getJob, updateJob } from './jobs';

interface StartJobParams {
  jobId: string;
  apiKey: string;
  youtubeUrl: string;
  briefUrl: string;
  clipCount: number; // 5-8
  maxClipSeconds: number; // 60
}

const TMP_ROOT = path.join(process.cwd(), 'tmp');
const OUTPUT_ROOT = path.join(process.cwd(), 'public', 'outputs');

export async function startJob(params: StartJobParams) {
  const { jobId, apiKey, youtubeUrl, briefUrl, clipCount, maxClipSeconds } = params;
  const workDir = path.join(TMP_ROOT, jobId);
  const outDir = path.join(OUTPUT_ROOT, jobId);

  try {
    await fs.mkdir(workDir, { recursive: true });
    await fs.mkdir(outDir, { recursive: true });

    updateJob(jobId, { status: 'downloading', progressMessage: 'Mengambil info video...' });
    const videoInfo = await getVideoInfo(youtubeUrl);

    if (!isDurationAllowed(videoInfo.durationSeconds)) {
      throw new Error(
        `Durasi video (${Math.round(videoInfo.durationSeconds / 60)} menit) melebihi batas maksimal 25 menit.`,
      );
    }
    updateJob(jobId, { videoInfo });

    updateJob(jobId, { progressMessage: 'Mendownload video (mohon tunggu, tergantung durasi video)...' });
    const sourcePath = await downloadVideo(youtubeUrl, workDir);

    updateJob(jobId, { progressMessage: 'Membaca brief campaign...' });
    let briefText = '';
    if (briefUrl && briefUrl.trim()) {
      try {
        briefText = await fetchBriefText(briefUrl.trim());
      } catch (e: any) {
        throw new Error(`Gagal membaca brief campaign: ${e.message}`);
      }
    }

    updateJob(jobId, {
      status: 'analyzing',
      progressMessage: 'AI sedang menonton & menganalisa seluruh video (bisa beberapa menit)...',
    });
    const plan = await analyzeVideoForClips({
      apiKey,
      localVideoPath: sourcePath,
      briefText,
      clipCount,
      maxClipSeconds,
      videoDurationSeconds: videoInfo.durationSeconds,
    });

    updateJob(jobId, {
      status: 'rendering',
      plan,
      renderStatuses: plan.map((c) => ({ index: c.index, status: 'pending' })),
      progressMessage: `Menemukan ${plan.length} momen. Mulai render clip satu per satu...`,
    });

    // WAJIB sequential (satu-satu), tidak boleh Promise.all / paralel
    for (const clip of plan) {
      const job = getJob(jobId);
      if (!job) return;

      const statuses = job.renderStatuses.map((s) =>
        s.index === clip.index ? { ...s, status: 'rendering' as const } : s,
      );
      updateJob(jobId, {
        renderStatuses: statuses,
        progressMessage: `Merender clip ${clip.index + 1} dari ${plan.length}: "${clip.title}"...`,
      });

      try {
        const outputPath = await renderClip({ sourcePath, clip, outDir });
        const relativePath = `/api/outputs/${jobId}/clip-${clip.index}.mp4`;
        const updated = getJob(jobId)!.renderStatuses.map((s) =>
          s.index === clip.index
            ? { ...s, status: 'done' as const, outputPath: relativePath }
            : s,
        );
        updateJob(jobId, { renderStatuses: updated });
      } catch (e: any) {
        const updated = getJob(jobId)!.renderStatuses.map((s) =>
          s.index === clip.index
            ? { ...s, status: 'error' as const, error: e.message }
            : s,
        );
        updateJob(jobId, { renderStatuses: updated });
      }
    }

    updateJob(jobId, { status: 'done', progressMessage: 'Semua clip selesai diproses!' });
  } catch (e: any) {
    updateJob(jobId, { status: 'error', error: e.message, progressMessage: 'Terjadi kesalahan.' });
  }
}
