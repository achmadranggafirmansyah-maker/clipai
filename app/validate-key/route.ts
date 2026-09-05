import { NextRequest, NextResponse } from 'next/server';
import { validateGeminiKey } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  const { apiKey } = await req.json();
  if (!apiKey) {
    return NextResponse.json({ valid: false, message: 'API key kosong.' }, { status: 400 });
  }
  const valid = await validateGeminiKey(apiKey);
  return NextResponse.json({
    valid,
    message: valid ? 'API key valid.' : 'API key tidak valid atau ditolak Google.',
  });
}
