import { NextResponse } from 'next/server';
import { callAppsScriptGet } from '@/lib/appsScript';

export async function GET() {
  try {
    const data = await callAppsScriptGet('list', { limit: '100' });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
