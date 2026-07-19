export const BASE_MULTIPLIER = 3.5;
export const SELLER_FEE_RATE = 0.25;
export const VAT_RATE = 0.1;
export const OPERATING_COST_RATE = 0.1;
export const AGENCY_FEE_RATE = 0.02;

export const MARGIN_SAFE_THRESHOLD = 3.2;
export const MARGIN_WARN_THRESHOLD = 2.5;

export type MarginLevel = 'safe' | 'warn' | 'danger' | 'unknown';

export function calcAutoPrice(cost: number): number {
  if (!cost || cost <= 0) return 0;
  return Math.round(cost * BASE_MULTIPLIER);
}

export function getMarginLevel(cost: number, price: number): MarginLevel {
  if (!cost || cost <= 0 || !price || price <= 0) return 'unknown';
  const multiplier = price / cost;
  if (multiplier >= MARGIN_SAFE_THRESHOLD) return 'safe';
  if (multiplier >= MARGIN_WARN_THRESHOLD) return 'warn';
  return 'danger';
}

export const MARGIN_MESSAGES: Record<MarginLevel, string> = {
  safe: '🟢 안전합니다',
  warn: '🟡 마진이 낮아지고 있어요, 확인해주세요',
  danger: '🔴 마진이 너무 낮습니다, 다시 확인해주세요',
  unknown: ''
};

export const VENDOR_CUSTOM_OPTION = '__custom__';
