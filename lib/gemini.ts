import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server';
import { ClipPlan } from './types';

const MODEL_NAME = 'gemini-2.0-flash'; // model multimodal video, cepat & murah

/**
 * Upload video lokal (hasil download yt-dlp) ke Gemini Files API.
 * Dipakai bukan lewat "link YouTube langsung" karena cara ini juga jalan
 * untuk video unlisted/privat (asal yt-dlp berhasil download-nya),
 * sedangkan fitur baca-langsung-dari-URL Gemini cuma jalan untuk video publik.
 */
async function uploadVideoToGemini(apiKey: string, filePath: string) {
  const fileManager = new GoogleAIFileManager(apiKey);
  const uploadResult = await fileManager.uploadFile(filePath, {
    mimeType: 'video/mp4',
    displayName: 'clipai-source',
  });

  let file = uploadResult.file;
  // Gemini butuh waktu memproses video sebelum bisa dianalisa
  while (file.state === FileState.PROCESSING) {
    await new Promise((r) => setTimeout(r, 5000));
    file = await fileManager.getFile(file.name);
  }
  if (file.state === FileState.FAILED) {
    throw new Error('Gemini gagal memproses file video yang diupload.');
  }
  return file;
}

interface AnalyzeParams {
  apiKey: string;
  localVideoPath: string;
  briefText: string;
  clipCount: number; // 5-8
  maxClipSeconds: number; // 60
  videoDurationSeconds: number;
}

const RESPONSE_SCHEMA_INSTRUCTION = `
Balas HANYA dengan JSON valid (tanpa markdown, tanpa penjelasan tambahan) dengan bentuk persis:
{
  "clips": [
    {
      "startSeconds": number,
      "endSeconds": number,
      "title": "judul singkat momen",
      "reasoning": "kenapa momen ini menarik/berpotensi viral, 1-2 kalimat",
      "viralScore": number (0-100),
      "splitScreenMoments": [{"start": number, "end": number}],
      "transcriptSrt": "isi file .srt lengkap untuk rentang clip ini, timestamp mulai dari 00:00:00,000",
      "recommendedCaption": "caption siap upload dalam Bahasa Indonesia gaya santai",
      "mandatoryHashtags": ["#dariBrief"],
      "recommendedHashtags": ["#maks5", "#relevan"],
      "taggedPeople": ["@nama jika disebutkan di brief atau terlihat"]
    }
  ]
}
Catatan penting:
- "startSeconds"/"endSeconds" relatif terhadap video ASLI (detik ke berapa dari awal video panjang).
- Setiap clip durasinya TIDAK BOLEH lebih dari ${''}MAX_CLIP_SECONDS detik.
- "splitScreenMoments" hanya diisi kalau video ini podcast/obrolan 2 orang DAN kamera sempat menampilkan kedua orang sekaligus dalam rentang waktu clip tsb; start/end di sini relatif ke AWAL CLIP (0 = awal clip), bukan ke video asli.
- "mandatoryHashtags" WAJIB diambil dari instruksi/hashtag yang disebutkan eksplisit di brief campaign. Kalau brief tidak menyebutkan hashtag wajib, kosongkan array-nya.
- Urutkan array "clips" bebas, sistem yang akan mengurutkan ulang berdasarkan viralScore.
`;

export async function analyzeVideoForClips(
  params: AnalyzeParams,
): Promise<ClipPlan[]> {
  const {
    apiKey,
    localVideoPath,
    briefText,
    clipCount,
    maxClipSeconds,
    videoDurationSeconds,
  } = params;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const uploadedFile = await uploadVideoToGemini(apiKey, localVideoPath);

  const instruction = RESPONSE_SCHEMA_INSTRUCTION.replace(
    'MAX_CLIP_SECONDS',
    String(maxClipSeconds),
  );

  const prompt = `
Kamu adalah editor video pendek profesional untuk media sosial (TikTok/Reels/Shorts).
Video ini berdurasi sekitar ${videoDurationSeconds} detik.

BRIEF CAMPAIGN (baca dengan SANGAT SEKSAMA sebelum menentukan clip apapun; ikuti semua aturan
dan HINDARI semua larangan yang disebutkan di brief ini):
---
${briefText || '(tidak ada brief campaign yang diberikan, gunakan penilaian umum konten paling menarik/berpotensi viral)'}
---

Tugas kamu: tonton seluruh video ini dengan seksama, lalu pilih tepat ${clipCount} momen paling
berpotensi viral/FYP (bisa momen lucu, momen ilmu/insight baru yang menambah pengetahuan penonton,
atau momen emosional/mengejutkan) — SELAMA masih sesuai fokus & aturan brief campaign di atas.
Setiap momen jadi satu clip pendek, maksimal ${maxClipSeconds} detik per clip.

${instruction}
`.trim();

  const result = await model.generateContent([
    {
      fileData: {
        fileUri: uploadedFile.uri,
        mimeType: uploadedFile.mimeType,
      },
    },
    { text: prompt },
  ]);

  const text = result.response.text().trim();
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');

  let parsed: { clips: any[] };
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(
      'Gemini tidak mengembalikan JSON yang valid. Coba jalankan ulang proses.',
    );
  }

  const clips: ClipPlan[] = parsed.clips.map((c, i) => ({
    index: i,
    startSeconds: Math.max(0, Math.round(c.startSeconds)),
    endSeconds: Math.round(c.endSeconds),
    title: c.title ?? `Clip ${i + 1}`,
    reasoning: c.reasoning ?? '',
    viralScore: Math.max(0, Math.min(100, Math.round(c.viralScore ?? 0))),
    splitScreenMoments: Array.isArray(c.splitScreenMoments)
      ? c.splitScreenMoments
      : [],
    transcriptSrt: c.transcriptSrt ?? '',
    recommendedCaption: c.recommendedCaption ?? '',
    mandatoryHashtags: Array.isArray(c.mandatoryHashtags)
      ? c.mandatoryHashtags
      : [],
    recommendedHashtags: Array.isArray(c.recommendedHashtags)
      ? c.recommendedHashtags.slice(0, 5)
      : [],
    taggedPeople: Array.isArray(c.taggedPeople) ? c.taggedPeople : [],
  }));

  // urutkan dari yang paling berpotensi viral
  clips.sort((a, b) => b.viralScore - a.viralScore);
  clips.forEach((c, i) => (c.index = i));

  return clips;
}

/** Validasi cepat API key: coba list model dengan key tsb. */
export async function validateGeminiKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    );
    return res.ok;
  } catch {
    return false;
  }
}
