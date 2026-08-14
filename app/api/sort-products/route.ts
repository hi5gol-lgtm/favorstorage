import { NextResponse } from 'next/server';
import { callAppsScriptPost } from '@/lib/appsScript';

export async function POST() {
  try {
    const data = await callAppsScriptPost({ action: 'sortByCode' });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
