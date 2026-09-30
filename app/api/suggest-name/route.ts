import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: { type: 'string' },
      description: '상품명 후보 5개 (한국어, 공백 포함 15자 이내, 핵심 특징 1~2개 + 종류)'
    },
    curationTips: {
      type: 'array',
      items: { type: 'string' },
      description: '라이브 방송에서 셀러가 그대로 읽을 수 있는 셀링 멘트 (1~2개, 각 1~2문장)'
    }
  },
  required: ['suggestions', 'curationTips'],
  additionalProperties: false
};

export async function POST(req: Request) {
  try {
    const { imageBase64, imageMimeType } = await req.json();
    if (!imageBase64) {
      return NextResponse.json({ ok: false, error: '이미지가 없습니다.' }, { status: 400 });
    }

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2048,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: imageMimeType || 'image/jpeg',
                data: imageBase64
              }
            },
            {
              type: 'text',
              text:
                '이 사진은 쥬얼리 도매업체(페이버주얼리)의 신규 등록 상품 사진입니다. 이 상품은 라이브 커머스 방송에서 ' +
                '셀러가 소개하며 판매합니다.\n\n' +
                '1) 상품명 후보 5개\n' +
                '방송 중 셀러가 한 번에 부르고 시청자가 바로 알아들을 수 있어야 해서 짧아야 합니다. ' +
                '공백 포함 15자 이내로, 가장 눈에 띄는 특징 1~2개 + 종류(귀걸이/목걸이/반지/팔찌 등)로만 지어주세요. ' +
                '좋은 예: "지르콘 하프링 귀걸이", "실버925 테니스 목걸이", "진주 눈꽃 드롭 귀걸이". ' +
                '나쁜 예(너무 김): "럭셔리 믹스컷 큐빅지르콘 하트귀걸이", "실버침 클로버 스퀘어큐빅 진주 귀걸이" — ' +
                '수식어나 소재를 여러 개 겹쳐 쌓지 마세요. 소재(실버925 등)는 사진이나 형태로 확실할 때만 넣으세요.\n\n' +
                '2) 방송 포인트 1~2개\n' +
                '셀러가 라이브에서 그대로 읽어도 되는 말투(예: "~예요", "~거든요")로, 각 1~2문장. ' +
                '시청자가 "어? 이거 사야겠다" 하고 혹하게 만드는 게 목적입니다. 스타일링 설명이나 타겟 분석처럼 ' +
                '보고서 같은 문장이 아니라, 이 상품을 했을 때의 구체적인 장면과 이득을 말해주세요 — 예를 들면 ' +
                '"하나만 해도 얼굴이 환해 보여서 출근룩에 매일 손이 가요", "선물 포장해서 드리면 받는 분이 먼저 가격 물어보는 디자인이에요", ' +
                '"이 반짝임에 이 가격이면 여러 컬러로 쟁여두셔도 돼요" 같은 식입니다. ' +
                '사진에서 확인할 수 없는 사실(알러지 없음, 품절 임박, 재고 수량, 연예인 착용 등)은 지어내지 마세요.'
            }
          ]
        }
      ]
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ ok: false, error: 'AI 응답을 처리하지 못했습니다.' }, { status: 500 });
    }

    const parsed = JSON.parse(textBlock.text);
    return NextResponse.json({
      ok: true,
      suggestions: parsed.suggestions || [],
      curationTips: (parsed.curationTips || []).slice(0, 2)
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
