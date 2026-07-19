import { NextResponse } from 'next/server';
import { callAppsScriptGet } from '@/lib/appsScript';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code') || '';
    const data = await callAppsScriptGet('checkDuplicate', { code });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
