# ClipAI — Auto Clip Video YouTube jadi Konten Viral

Web AI yang menonton video YouTube-mu (maks 20-25 menit), membaca brief campaign-mu,
lalu otomatis memotong 5-8 momen paling berpotensi viral jadi klip pendek (maks 60
detik/klip) dengan style **Blur Background**, subtitle otomatis, caption & hashtag
siap upload — semua bisa kamu jalankan lewat HP tanpa install apa-apa di perangkatmu
sendiri (prosesnya jalan di server/cloud).

---

## Bagian 1 — Cara Bikin API Key Gemini (gratis)

1. Buka **aistudio.google.com** di browser HP, login pakai akun Google.
2. Tap **"Get API key"** di menu.
3. Tap **"Create API key"** → pilih/buat project.
4. Salin API key (diawali `AIza...`). Simpan baik-baik, jangan dibagikan ke orang lain.

Nanti API key ini yang kamu masukkan di step 1 web-nya (tersimpan di device kamu
sendiri di browser, dikirim ke server hanya untuk proses saat itu, tidak disimpan
permanen di server).

---

## Bagian 2 — Deploy ke Railway (semua lewat HP, via GitHub)

### 2.1 Upload kode ini ke GitHub
1. Buka **github.com** di browser HP → login/daftar (gratis).
2. Tap tombol **"+"** → **"New repository"**. Kasih nama misalnya `clipai`. Set **Public** atau **Private** (bebas). Tap **Create repository**.
3. Di halaman repo, tap **"Add file" → "Upload files"**.
4. Upload SEMUA file & folder dari project ini (drag semua file yang kamu download dari chat ini). Pastikan struktur foldernya tetap sama (jangan cuma isi dalamnya doang tanpa foldernya).
5. Scroll bawah, tap **"Commit changes"**.

> Tips: kalau upload lewat browser HP terasa ribet untuk banyak file sekaligus, install
> app **"Working Copy"** (iOS) atau **"GitHub"** app resmi / termux (Android) untuk push
> lebih gampang. Tapi upload manual lewat browser tetap bisa kok, cuma lebih pelan.

### 2.2 Deploy di Railway
1. Buka **railway.app** di browser HP → **Login with GitHub**.
2. Tap **"New Project"** → **"Deploy from GitHub repo"** → pilih repo `clipai` yang tadi diupload.
3. Railway otomatis mendeteksi `Dockerfile` dan mulai build image (ffmpeg + yt-dlp + Next.js). Tunggu sampai status **"Success"** (build pertama biasanya 3-6 menit).
4. Masuk ke tab **Settings** project → **Networking** → tap **"Generate Domain"**. Railway akan kasih URL publik, misalnya `clipai-production.up.railway.app`.
5. Buka URL itu di browser HP — web ClipAI kamu sudah live! 🎉

### 2.3 (Opsional) Ganti Volume/Storage
Secara default, file hasil render (`public/outputs`) disimpan di disk container. Kalau
container restart, file lama akan hilang (tapi kamu tetap bisa proses ulang). Kalau mau
hasil clip disimpan permanen antar-restart, tambahkan **Railway Volume** dan mount ke
path `/app/public/outputs` lewat tab **Settings → Volumes**.

---

## Alur Pemakaian Web

1. **API Key** — masukkan & validasi Gemini API key.
2. **URL YouTube** — masukkan link, cek thumbnail & durasi (maks 20-25 menit).
3. **Brief Campaign** — masukkan link brief (Google Docs/halaman web publik), AI akan membacanya sebelum menentukan clip.
4. **Style** — Blur Background (style lain menyusul).
5. **Auto Caption** — selalu aktif, subtitle otomatis dibakar ke video.
6. **Jumlah Clip** — pilih 5-8 clip, maks 60 detik/clip.
7. **Proses** — AI mendownload video, membaca brief, menganalisa seluruh isi video, lalu me-render clip **satu per satu (sequential)**, resolusi output di-cap **720p**.
8. **Hasil** — daftar clip diurutkan dari paling berpotensi viral, lengkap caption + hashtag wajib (dari brief) + hashtag rekomendasi (maks 5) + tag orang + tombol download per clip.

---

## Batasan & Hal Penting yang Perlu Kamu Tahu

- **Video privat/unlisted**: yt-dlp bisa mendownload video unlisted (kalau link-nya
  benar) dan sebagian video privat *kalau* kamu menambahkan file cookies browser
  (fitur lanjutan, belum ada di UI versi ini — tanya aku kalau mau ditambahkan).
  Video yang benar-benar dibatasi/private tanpa akses tidak bisa diproses siapa pun,
  termasuk oleh AI ini.
- **Hak cipta & ToS YouTube**: mendownload video YouTube berpotensi melanggar Terms
  of Service YouTube tergantung video & tujuan pemakaiannya. Pastikan kamu punya hak/izin
  atas video yang kamu proses (video sendiri, video klien dengan izin, dsb).
- **Style Blur Background v1**: efek split-screen memakai heuristik "bagi frame
  kiri-kanan" sederhana — cocok untuk podcast dengan framing 2 kamera berdampingan.
  Kalau posisi orangnya tidak simetris, hasil split-screen bisa perlu disesuaikan lagi
  (bisa diminta perbaikan lanjutan).
- **Waktu proses**: video 20 menit + analisa AI + render 6-8 clip bisa memakan waktu
  beberapa menit sampai puluhan menit tergantung spek server Railway yang dipakai.
- **Biaya**: hosting Railway ada free trial credit lalu berbayar sesuai pemakaian;
  Gemini API punya kuota gratis harian, cek harga terbaru di ai.google.dev/pricing.

---

## Struktur Project

```
clipai/
├── Dockerfile              # ffmpeg + yt-dlp + Next.js
├── app/
│   ├── page.tsx             # halaman utama (render Wizard)
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       ├── validate-key/    # cek API key Gemini
│       ├── video-info/      # ambil thumbnail & durasi YouTube
│       ├── analyze/         # mulai job (download+AI+render)
│       └── analyze/status/  # polling status job
├── components/
│   └── Wizard.tsx           # seluruh UI step 1-7 + halaman hasil
├── lib/
│   ├── youtube.ts           # wrapper yt-dlp
│   ├── brief.ts             # ambil teks brief campaign
│   ├── gemini.ts            # upload video & analisa clip via Gemini
│   ├── ffmpeg.ts             # style Blur Background + split-screen + subtitle
│   ├── pipeline.ts          # orkestrasi keseluruhan proses
│   └── jobs.ts              # status job in-memory
└── public/outputs/          # hasil render (disajikan sebagai file statis)
```

Kalau mau nambah style clip baru, style caption baru, atau perbaikan apa pun — tinggal
bilang, project ini dibuat supaya gampang dikembangkan bertahap.
