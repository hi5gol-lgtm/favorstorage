import { NextResponse } from 'next/server';
import { callAppsScriptPost } from '@/lib/appsScript';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = await callAppsScriptPost({ action: 'delete', ...body });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
