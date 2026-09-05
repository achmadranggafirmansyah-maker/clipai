import { NextRequest, NextResponse } from 'next/server';
import { getVideoInfo, isDurationAllowed } from '@/lib/youtube';

export async function POST(req: NextRequest) {
  const { youtubeUrl } = await req.json();
  if (!youtubeUrl) {
    return NextResponse.json({ error: 'URL YouTube kosong.' }, { status: 400 });
  }

  try {
    const info = await getVideoInfo(youtubeUrl);
    const allowed = isDurationAllowed(info.durationSeconds);
    return NextResponse.json({
      ...info,
      durationAllowed: allowed,
      warning: allowed
        ? null
        : `Durasi video ${Math.round(info.durationSeconds / 60)} menit melebihi batas maksimal 25 menit.`,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'Gagal mengambil info video. Pastikan link benar & video bisa diakses.' },
      { status: 400 },
    );
  }
}
