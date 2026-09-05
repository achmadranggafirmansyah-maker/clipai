export interface VideoInfo {
  id: string;
  title: string;
  thumbnail: string;
  durationSeconds: number;
  isPrivateOrUnlisted: boolean;
}

export interface SplitMoment {
  start: number; // detik, relatif ke awal clip
  end: number;
}

export interface ClipPlan {
  index: number;
  startSeconds: number; // relatif ke video asli
  endSeconds: number; // relatif ke video asli
  title: string;
  reasoning: string;
  viralScore: number; // 0-100, dipakai untuk urutan hasil
  splitScreenMoments: SplitMoment[]; // relatif ke clip (start dari 0)
  transcriptSrt: string; // isi file .srt untuk clip ini
  recommendedCaption: string;
  mandatoryHashtags: string[]; // wajib dari brief campaign
  recommendedHashtags: string[]; // maks 5, relevan
  taggedPeople: string[];
}

export interface AnalyzeResult {
  videoInfo: VideoInfo;
  clips: ClipPlan[];
}

export type JobStatus =
  | 'queued'
  | 'downloading'
  | 'analyzing'
  | 'rendering'
  | 'done'
  | 'error';

export interface ClipRenderStatus {
  index: number;
  status: 'pending' | 'rendering' | 'done' | 'error';
  outputPath?: string;
  error?: string;
}

export interface Job {
  id: string;
  status: JobStatus;
  progressMessage: string;
  error?: string;
  plan?: ClipPlan[];
  videoInfo?: VideoInfo;
  renderStatuses: ClipRenderStatus[];
  createdAt: number;
}
