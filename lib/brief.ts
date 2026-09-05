/**
 * Ambil isi teks brief campaign dari sebuah URL agar bisa dibaca AI sebelum clipping.
 * Mendukung halaman web biasa & Google Docs (auto-convert ke export text kalau
 * link yang dikasih adalah link "share" biasa).
 */
export async function fetchBriefText(url: string): Promise<string> {
  let fetchUrl = url;

  const gdocsMatch = url.match(
    /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/,
  );
  if (gdocsMatch) {
    const docId = gdocsMatch[1];
    fetchUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
  }

  const res = await fetch(fetchUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (ClipAI Brief Reader)' },
  });

  if (!res.ok) {
    throw new Error(
      `Gagal mengambil brief campaign (status ${res.status}). Pastikan link bisa diakses publik ("Anyone with the link").`,
    );
  }

  const contentType = res.headers.get('content-type') || '';
  const raw = await res.text();

  if (contentType.includes('text/html')) {
    // strip tag HTML kasar supaya AI cuma baca teksnya
    return raw
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 20000);
  }

  return raw.trim().slice(0, 20000);
}
