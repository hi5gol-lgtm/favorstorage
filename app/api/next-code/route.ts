import { NextResponse } from 'next/server';
import { callAppsScriptGet } from '@/lib/appsScript';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const vendor = searchParams.get('vendor') || '';
    const data = await callAppsScriptGet('nextCode', { vendor });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
