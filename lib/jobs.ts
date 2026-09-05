import { Job } from './types';

// Catatan: penyimpanan in-memory ini cukup untuk 1 instance container (Railway).
// Kalau nanti di-scale ke banyak instance, ganti dengan Redis/DB.
const jobs = new Map<string, Job>();

export function createJob(id: string): Job {
  const job: Job = {
    id,
    status: 'queued',
    progressMessage: 'Menunggu diproses...',
    renderStatuses: [],
    createdAt: Date.now(),
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, patch: Partial<Job>) {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, patch);
}
