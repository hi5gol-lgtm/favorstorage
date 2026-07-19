import { NextResponse } from 'next/server';
import { callAppsScriptGet, callAppsScriptPost } from '@/lib/appsScript';

export async function GET() {
  try {
    const data = await callAppsScriptGet('vendors');
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = await callAppsScriptPost({ action: 'addVendor', vendor: body.vendor });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
