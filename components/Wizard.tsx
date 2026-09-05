'use client';

import { useEffect, useRef, useState } from 'react';

type StepKey = 'apiKey' | 'youtube' | 'brief' | 'style' | 'caption' | 'clipCount' | 'process' | 'results';

const STEP_ORDER: StepKey[] = ['apiKey', 'youtube', 'brief', 'style', 'caption', 'clipCount', 'process', 'results'];

interface VideoInfo {
  title: string;
  thumbnail: string;
  durationSeconds: number;
  durationAllowed: boolean;
  warning: string | null;
}

interface RenderStatus {
  index: number;
  status: 'pending' | 'rendering' | 'done' | 'error';
  outputPath?: string;
  error?: string;
}

interface ClipPlan {
  index: number;
  title: string;
  reasoning: string;
  viralScore: number;
  recommendedCaption: string;
  mandatoryHashtags: string[];
  recommendedHashtags: string[];
  taggedPeople: string[];
}

interface JobState {
  status: string;
  progressMessage: string;
  error?: string;
  plan?: ClipPlan[];
  renderStatuses: RenderStatus[];
}

export default function Wizard() {
  const [step, setStep] = useState<StepKey>('apiKey');

  // step 1
  const [apiKey, setApiKey] = useState('');
  const [keyValidating, setKeyValidating] = useState(false);
  const [keyValid, setKeyValid] = useState<boolean | null>(null);
  const [keyMsg, setKeyMsg] = useState('');

  // step 2
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoErr, setVideoErr] = useState('');

  // step 3
  const [briefUrl, setBriefUrl] = useState('');

  // step 5 clip count
  const [clipCount, setClipCount] = useState(6);

  // step 6/7 job
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/analyze/status?jobId=${jobId}`);
      if (!res.ok) return;
      const data = await res.json();
      setJob(data);
      if (data.status === 'done' || data.status === 'error') {
        if (pollRef.current) clearInterval(pollRef.current);
        if (data.status === 'done') setStep('results');
      }
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId]);

  async function handleValidateKey() {
    setKeyValidating(true);
    setKeyMsg('');
    try {
      const res = await fetch('/api/validate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();
      setKeyValid(data.valid);
      setKeyMsg(data.message);
    } catch {
      setKeyValid(false);
      setKeyMsg('Gagal menghubungi server untuk validasi.');
    } finally {
      setKeyValidating(false);
    }
  }

  async function handleFetchVideoInfo() {
    setVideoLoading(true);
    setVideoErr('');
    setVideoInfo(null);
    try {
      const res = await fetch('/api/video-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVideoErr(data.error || 'Gagal mengambil info video.');
      } else {
        setVideoInfo(data);
      }
    } catch {
      setVideoErr('Gagal menghubungi server.');
    } finally {
      setVideoLoading(false);
    }
  }

  async function handleStartProcess() {
    setStep('process');
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, youtubeUrl, briefUrl, clipCount }),
    });
    const data = await res.json();
    if (data.jobId) {
      setJobId(data.jobId);
      setJob({ status: 'queued', progressMessage: 'Memulai...', renderStatuses: [] });
    }
  }

  const currentIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="container">
      <div className="header">
        <h1>ClipAI</h1>
        <p>Ubah video YouTube panjang jadi klip pendek siap viral, otomatis dengan AI</p>
      </div>

      {step !== 'results' && (
        <div className="steps-nav">
          {STEP_ORDER.slice(0, 7).map((s, i) => (
            <div key={s} className={`dot ${i === currentIndex ? 'active' : i < currentIndex ? 'done' : ''}`} />
          ))}
        </div>
      )}

      {step === 'apiKey' && (
        <div className="card">
          <h2>1. Masukkan API Key Gemini</h2>
          <p className="hint">
            Dipakai supaya AI bisa "menonton" video YouTube-mu secara langsung. Belum punya API key?{' '}
            <a href="#tutorial-api-key" style={{ color: '#a5b4fc' }}>
              Lihat tutorial cara membuatnya (gratis, 2 menit)
            </a>
            .
          </p>
          <label>Gemini API Key</label>
          <input
            type="password"
            placeholder="AIzaSy..."
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setKeyValid(null);
            }}
          />
          <button className="btn" onClick={handleValidateKey} disabled={!apiKey || keyValidating}>
            {keyValidating ? 'Memeriksa...' : 'Cek & Validasi API Key'}
          </button>
          {keyMsg && <p className={keyValid ? 'msg-success' : 'msg-error'}>{keyMsg}</p>}
          {keyValid && (
            <button className="btn" style={{ marginTop: 12 }} onClick={() => setStep('youtube')}>
              Lanjut →
            </button>
          )}
        </div>
      )}

      {step === 'youtube' && (
        <div className="card">
          <h2>2. Link Video YouTube</h2>
          <p className="hint">
            Maksimal durasi video 20-25 menit. Pastikan thumbnail di bawah sesuai supaya tidak salah video.
          </p>
          <label>URL Video YouTube</label>
          <input
            type="url"
            placeholder="https://www.youtube.com/watch?v=..."
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
          />
          <button className="btn" onClick={handleFetchVideoInfo} disabled={!youtubeUrl || videoLoading}>
            {videoLoading ? 'Mengambil info video...' : 'Cek Video'}
          </button>
          {videoErr && <p className="msg-error">{videoErr}</p>}
          {videoInfo && (
            <div>
              <img className="thumb-preview" src={videoInfo.thumbnail} alt="thumbnail" />
              <p style={{ fontSize: 13, marginTop: 8 }}>{videoInfo.title}</p>
              <p style={{ fontSize: 12.5, color: '#9aa4bc' }}>
                Durasi: {Math.floor(videoInfo.durationSeconds / 60)} menit {videoInfo.durationSeconds % 60} detik
              </p>
              {!videoInfo.durationAllowed && <p className="msg-error">{videoInfo.warning}</p>}
              {videoInfo.durationAllowed && (
                <button className="btn" style={{ marginTop: 10 }} onClick={() => setStep('brief')}>
                  Video Sudah Benar, Lanjut →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {step === 'brief' && (
        <div className="card">
          <h2>3. Link Brief Campaign</h2>
          <p className="hint">
            AI akan membaca brief ini dengan seksama sebelum menentukan clip, supaya hasilnya sesuai aturan &
            menghindari larangan yang ada di brief. Gunakan link yang bisa diakses publik (mis. Google Docs
            dengan akses "Anyone with the link").
          </p>
          <label>URL Brief Campaign (opsional, tapi sangat disarankan)</label>
          <input
            type="url"
            placeholder="https://docs.google.com/document/d/..."
            value={briefUrl}
            onChange={(e) => setBriefUrl(e.target.value)}
          />
          <button className="btn" onClick={() => setStep('style')}>
            Lanjut →
          </button>
        </div>
      )}

      {step === 'style' && (
        <div className="card">
          <h2>4. Style Clipping Video</h2>
          <div className="style-card">
            <h3>✓ Blur Background (aktif)</h3>
            <p>
              Video di-crop penuh 9:16 dengan latar blur, layer utama di-zoom fokus ke orang. Kalau video
              podcast 2 orang & kamera menampilkan keduanya, otomatis berubah jadi split-screen (atas-bawah)
              dan blur background hilang sementara.
            </p>
          </div>
          <div className="pill-group" style={{ marginTop: 12 }}>
            <span className="pill" style={{ opacity: 0.4 }}>
              Style lain segera hadir
            </span>
          </div>
          <button className="btn" style={{ marginTop: 14 }} onClick={() => setStep('caption')}>
            Lanjut →
          </button>
        </div>
      )}

      {step === 'caption' && (
        <div className="card">
          <h2>5. Auto Caption</h2>
          <div className="toggle-row">
            <div>
              <div className="toggle-label">Subtitle otomatis</div>
              <div className="toggle-sub">Selalu aktif — tidak bisa dimatikan, supaya semua klip tetap ramah tonton tanpa suara.</div>
            </div>
            <div className="switch" />
          </div>
          <button className="btn" style={{ marginTop: 14 }} onClick={() => setStep('clipCount')}>
            Lanjut →
          </button>
        </div>
      )}

      {step === 'clipCount' && (
        <div className="card">
          <h2>6. Jumlah Clip</h2>
          <p className="hint">Maksimal durasi tiap clip 60 detik.</p>
          <div className="pill-group">
            {[5, 6, 7, 8].map((n) => (
              <div
                key={n}
                className={`pill ${clipCount === n ? 'selected' : ''}`}
                onClick={() => setClipCount(n)}
              >
                {n} clip
              </div>
            ))}
          </div>
          <button className="btn" style={{ marginTop: 14 }} onClick={handleStartProcess}>
            🚀 Mulai Proses Clipping
          </button>
        </div>
      )}

      {step === 'process' && (
        <div className="card progress-box">
          <div className="spinner" />
          <p style={{ fontWeight: 600 }}>{job?.progressMessage || 'Memproses...'}</p>
          {job?.status === 'error' && <p className="msg-error">{job.error}</p>}
          {job?.renderStatuses && job.renderStatuses.length > 0 && (
            <div style={{ textAlign: 'left', marginTop: 16 }}>
              {job.renderStatuses.map((r) => (
                <p key={r.index} style={{ fontSize: 13 }}>
                  Clip {r.index + 1}:{' '}
                  {r.status === 'done' && <span style={{ color: '#22c55e' }}>selesai ✓</span>}
                  {r.status === 'rendering' && <span className="badge-rendering">sedang render...</span>}
                  {r.status === 'pending' && <span style={{ color: '#9aa4bc' }}>menunggu antrian</span>}
                  {r.status === 'error' && <span className="badge-error">gagal: {r.error}</span>}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 'results' && job?.plan && (
        <ResultsList plan={job.plan} renderStatuses={job.renderStatuses} />
      )}

      {step === 'apiKey' && (
        <div className="card" id="tutorial-api-key">
          <h2>📘 Tutorial: Cara Buat API Key Gemini (Gratis)</h2>
          <ol style={{ fontSize: 13, color: '#c9cfe3', lineHeight: 1.8, paddingLeft: 18 }}>
            <li>Buka <b>aistudio.google.com</b> di browser HP kamu, login pakai akun Google.</li>
            <li>Tap menu <b>"Get API key"</b> di kiri atas / sidebar.</li>
            <li>Tap <b>"Create API key"</b>, pilih project (atau buat project baru otomatis).</li>
            <li>Salin (copy) API key yang muncul (diawali "AIza...").</li>
            <li>Tempel (paste) ke kolom di atas, lalu tap "Cek & Validasi API Key".</li>
          </ol>
        </div>
      )}
    </div>
  );
}

function ResultsList({
  plan,
  renderStatuses,
}: {
  plan: ClipPlan[];
  renderStatuses: RenderStatus[];
}) {
  return (
    <div>
      <div className="card">
        <h2>🎉 Hasil Clip Kamu</h2>
        <p className="hint">Diurutkan dari yang paling berpotensi viral/FYP di TikTok.</p>
      </div>
      {plan.map((clip) => {
        const rs = renderStatuses.find((r) => r.index === clip.index);
        return (
          <div className="clip-card" key={clip.index}>
            <span className="clip-rank">#{clip.index + 1} • Skor Viral {clip.viralScore}/100</span>
            <h3>{clip.title}</h3>
            <p className="reasoning">{clip.reasoning}</p>

            {rs?.status === 'done' && rs.outputPath && (
              <video src={rs.outputPath} controls playsInline />
            )}
            {rs?.status === 'error' && <p className="badge-error">Gagal render: {rs.error}</p>}

            <div className="caption-box">{clip.recommendedCaption}</div>

            <div className="hashtags">
              {clip.mandatoryHashtags.map((h, i) => (
                <span className="hashtag mandatory" key={`m-${i}`}>{h}</span>
              ))}
              {clip.recommendedHashtags.map((h, i) => (
                <span className="hashtag" key={`r-${i}`}>{h}</span>
              ))}
              {clip.taggedPeople.map((p, i) => (
                <span className="hashtag" key={`p-${i}`}>{p}</span>
              ))}
            </div>

            {rs?.status === 'done' && rs.outputPath && (
              <a className="btn" href={'${rs.outputPath}?download=1'} download>
                ⬇ Download Clip Ini
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}
