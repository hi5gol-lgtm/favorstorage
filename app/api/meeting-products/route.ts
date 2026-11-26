import { NextResponse } from 'next/server';
import { callAppsScriptGet } from '@/lib/appsScript';
import { PRODUCT_LIST_LIMIT } from '@/lib/constants';

// 미팅(납품 영업)용 — 화면을 창고 쪽에 보여주므로 원가·제작가·거래처는 내려주지 않는다.
// 서버에서만 원가를 보고 판매가를 계산한다: 원가×3.5로 잡아둔 상품은 3.6배로, 3.5배보다 낮게 잡은 상품은 기존 가격 그대로(low 표시).
// ?bulk=1 이면 낮게 잡은 상품도 전부 3.6배로 일괄 적용한다.
const MEETING_MULTIPLIER = 3.6;
const EXCLUDE_NAME = /무나|무료나눔/;

function round100(n: number) {
  return Math.round(n / 100) * 100;
}

export async function GET(req: Request) {
  try {
    const bulk = new URL(req.url).searchParams.get('bulk') === '1';
    const data = await callAppsScriptGet('list', { limit: String(PRODUCT_LIST_LIMIT) });
    if (!data.ok) return NextResponse.json(data, { status: 500 });
    const items = (data.items as Record<string, unknown>[])
      .filter((it) => !EXCLUDE_NAME.test(String(it.name ?? '')))
      .map((it) => {
        const cost = Number(it.cost) || 0;
        const orig = Number(it.price) || 0;
        const ratio = cost > 0 && orig > 0 ? orig / cost : 0;
        // low: 3.5배보다 낮게 잡은 상품 / odd: 원가·판매가가 이상해 보이는 상품
        const odd = ratio > 0 && (ratio > 20 || ratio < 2.5);
        const low = ratio > 0 && !odd && ratio < 3.45;
        const std = ratio >= 3.45 && ratio <= 3.59;
        const price = cost > 0 && (std || (low && bulk)) ? round100(cost * MEETING_MULTIPLIER) : orig;
        return {
          code: String(it.code ?? ''),
          name: String(it.name ?? ''),
          option1: String(it.option1 ?? ''),
          option2: String(it.option2 ?? ''),
          price,
          origPrice: orig,
          low,
          odd,
          description: String(it.description ?? ''),
          imageUrl: String(it.imageUrl ?? '')
        };
      });
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
