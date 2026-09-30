import { NextResponse } from 'next/server';
import { callAppsScriptPost } from '@/lib/appsScript';

export async function POST(req: Request) {
  try {
    const { code, memo } = await req.json();
    const data = await callAppsScriptPost({ action: 'saveLiveMemo', code: String(code ?? ''), memo: String(memo ?? '') });
    return NextResponse.json(data, { status: data.ok ? 200 : 500 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
