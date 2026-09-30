import { NextResponse } from 'next/server';
import { callAppsScriptGet } from '@/lib/appsScript';

type MemoMap = Record<string, { memo: string; updatedAt: number | null }>;

// 라이브 큐시트용 — 셀러/스탭이 화면을 볼 수 있으므로 원가·제작가·거래처 등 내부 정보는 여기서 아예 빼고 내려준다.
export async function GET() {
  try {
    const [data, memoData] = await Promise.all([
      callAppsScriptGet('list', { limit: '2000' }),
      // 라이브메모는 Apps Script 재배포 전이면 'unknown action'으로 실패한다 — 메모 없이 목록은 보여준다.
      callAppsScriptGet('liveMemos').catch(() => null)
    ]);
    if (!data.ok) return NextResponse.json(data, { status: 500 });
    const memosAvailable = !!memoData?.ok;
    const memos: MemoMap = memosAvailable ? memoData.memos : {};
    const items = (data.items as Record<string, unknown>[]).map((it) => {
      const code = String(it.code ?? '');
      return {
        code,
        name: String(it.name ?? ''),
        option1: String(it.option1 ?? ''),
        option2: String(it.option2 ?? ''),
        price: Number(it.price) || 0,
        stock: Number(it.stock) || 0,
        description: String(it.description ?? ''),
        curationTip: String(it.curationTip ?? ''),
        imageUrl: String(it.imageUrl ?? ''),
        memo: memos[code]?.memo ?? '',
        memoUpdatedAt: memos[code]?.updatedAt ?? null
      };
    });
    return NextResponse.json({ ok: true, items, memosAvailable });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
