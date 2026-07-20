import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: { type: 'string' },
      description: '상품명 후보 5개 (한국어, 기존 상품명 스타일 참고)'
    },
    curationTips: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 2,
      description: '셀러가 참고할 스타일링/트렌드/타겟 관련 큐레이션 팁 (1~2개, 짧고 핵심만)'
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
                '이 사진은 쥬얼리 도매업체(페이버주얼리)의 신규 등록 상품 사진입니다. ' +
                '기존 상품명 스타일(예: "실버925 오로라 스퀘어 목걸이", "큐빅 드랍 블랙앤화이트 귀걸이")을 참고해서, ' +
                '이 상품에 어울리는 한국어 상품명 후보 5개를 제안해주세요. 소재(실버925, 신주 등)나 특징(모티브, 형태)이 ' +
                '사진에서 보이면 반영하세요.\n\n' +
                '그리고 셀러가 판매할 때 참고할 수 있는 큐레이션 팁을 1~2개만 짧고 핵심적으로 제안해주세요 — 스타일링 ' +
                '제안(예: 하객룩, 데일리룩), 요즘 유행하는 디자인 요소와의 연관성, 어울리는 타겟 고객층 중 이 상품에 ' +
                '가장 잘 맞는 것 위주로 간결하게 작성해주세요.'
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
      curationTips: parsed.curationTips || []
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
