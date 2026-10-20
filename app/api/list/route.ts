import { NextResponse } from 'next/server';
import { callAppsScriptGet } from '@/lib/appsScript';
import { PRODUCT_LIST_LIMIT } from '@/lib/constants';

export async function GET() {
  try {
    const data = await callAppsScriptGet('list', { limit: String(PRODUCT_LIST_LIMIT) });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
