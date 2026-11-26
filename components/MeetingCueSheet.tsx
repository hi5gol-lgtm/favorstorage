'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

interface LiveProduct {
  code: string;
  name: string;
  option1: string;
  option2: string;
  price: number;
  origPrice: number;
  low: boolean;
  odd: boolean;
  stock: number;
  description: string;
  curationTip: string;
  imageUrl: string;
  memo: string;
  memoUpdatedAt: number | null;
}

type SortMode = 'code' | 'priceAsc' | 'priceDesc';
type FilterMode = 'all' | 'todo' | 'done';

// 시트에 종류 칸이 없어서 상품명 단어로 분류한다. 위에서부터 먼저 걸리는 쪽으로 — '링 귀걸이'는 귀걸이, '링 목걸이'는 목걸이.
const CATEGORY_RULES: [string, RegExp][] = [
  ['귀걸이', /귀걸이|원터치|이어링|이어커프|피어싱/],
  ['목걸이', /목걸이|네크리스/],
  ['팔찌', /팔찌|브레이슬릿/],
  ['발찌', /발찌/],
  ['반지', /반지|링\s*$|링\s/]
];
const CATEGORY_ORDER = [...CATEGORY_RULES.map(([name]) => name), '기타'];

const MATERIALS = ['실버925', '브라스', '써지컬', '모이사'];
function hasMaterial(p: { name: string }, m: string) {
  const flat = p.name.replace(/\s+/g, '');
  return m === '실버925' ? /실버|925/.test(flat) : flat.includes(m);
}

function categoryOf(name: string) {
  return CATEGORY_RULES.find(([, re]) => re.test(name))?.[0] ?? '기타';
}

interface CueState {
  cue: string[];
  done: string[];
  current: string;
  sort: SortMode;
  filter: FilterMode;
  category: string;
  material: string;
  bulk: boolean;
}

// 방송 순서·완료 체크·정렬은 방송하는 기기 한 대에서 쓰므로 브라우저에 저장한다.
const STORAGE_KEY = 'favor-meeting-cuesheet-v1';
// Apps Script 응답이 수 초~20초씩 걸리고 가끔 실패해서, 마지막으로 받은 상품 목록을 보관해 두고 먼저 띄운다.
const PRODUCTS_CACHE_KEY = 'favor-meeting-products-v1';
// 시트(라이브메모 탭)에 아직 못 올린 메모 { 품번: 메모 } — 방송 중 시트가 느리거나 실패해도 메모를 잃지 않게.
const MEMO_PENDING_KEY = 'favor-meeting-memo-pending-v1';

function readJson<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 공간을 못 쓰는 환경이어도 화면은 계속 동작하게 둔다.
  }
}
const EMPTY_STATE: CueState = { cue: [], done: [], current: '', sort: 'code', filter: 'all', category: 'all', material: 'all', bulk: false };
// 재고 999 = 상시 재고로 간주하는 값이라 화면에 표시하지 않는다.
const UNLIMITED_STOCK = 999;

const SORT_LABELS: Record<SortMode, string> = {
  code: '품번순',
  priceAsc: '낮은 가격순',
  priceDesc: '높은 가격순'
};

function loadState(): CueState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw);
    return {
      cue: Array.isArray(parsed.cue) ? parsed.cue : [],
      done: Array.isArray(parsed.done) ? parsed.done : [],
      current: typeof parsed.current === 'string' ? parsed.current : '',
      sort: parsed.sort in SORT_LABELS ? parsed.sort : 'code',
      filter: ['all', 'todo', 'done'].includes(parsed.filter) ? parsed.filter : 'all',
      category: typeof parsed.category === 'string' ? parsed.category : 'all',
      material: typeof parsed.material === 'string' ? parsed.material : 'all',
      bulk: parsed.bulk === true
    };
  } catch {
    return EMPTY_STATE;
  }
}

function formatPrice(price: number) {
  return price ? `${price.toLocaleString('ko-KR')}원` : '가격 미정';
}

function formatSavedAt(ts: number) {
  const d = new Date(ts);
  const time = d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return `오늘 ${time}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

function splitOptions(value: string) {
  return value
    .split(/[,/]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function compareCode(a: LiveProduct, b: LiveProduct) {
  return a.code.localeCompare(b.code, 'ko', { numeric: true });
}

export default function MeetingCueSheet() {
  const [products, setProducts] = useState<LiveProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [state, setState] = useState<CueState>(EMPTY_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState('');
  // 기본 화면은 목록. 상품을 누르면 크게 보기로 넘어간다(좁은 화면 기준).
  const [panelOpen, setPanelOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [memosAvailable, setMemosAvailable] = useState(true);
  const [pendingCodes, setPendingCodes] = useState<string[]>([]);
  const [memoFailed, setMemoFailed] = useState<string[]>([]);
  const [memoDraft, setMemoDraft] = useState<string | null>(null);
  const pendingRef = useRef<Record<string, string>>({});
  const savedAtRef = useRef<number | null>(null);
  const bulkRef = useRef(false);
  const [internal, setInternal] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  // 상품이 바뀌면 항상 사진부터 보이도록 맨 위로 올리고, 쓰던 메모 편집창은 닫는다.
  useEffect(() => {
    detailRef.current?.scrollTo({ top: 0 });
    setMemoDraft(null);
  }, [state.current]);

  useEffect(() => {
    savedAtRef.current = savedAt;
  }, [savedAt]);

  useEffect(() => {
    const loaded = loadState();
    bulkRef.current = loaded.bulk;
    setState(loaded);
    pendingRef.current = readJson<Record<string, string>>(MEMO_PENDING_KEY) ?? {};
    setPendingCodes(Object.keys(pendingRef.current));
    const cached = readJson<{ items: LiveProduct[]; savedAt: number | null }>(PRODUCTS_CACHE_KEY);
    if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
      setProducts(withPendingMemos(cached.items));
      setSavedAt(typeof cached.savedAt === 'number' ? cached.savedAt : null);
      setLoading(false);
    }
    setHydrated(true);
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 시트에 아직 못 올린 메모를 덮어쓴다 — 시트에서 받은 옛 메모가 방금 쓴 메모를 지우지 않도록.
  function withPendingMemos(items: LiveProduct[]) {
    const pending = pendingRef.current;
    return items.map((p) => (p.code in pending ? { ...p, memo: pending[p.code] } : p));
  }

  function setPending(code: string, memo: string | null) {
    if (memo === null) delete pendingRef.current[code];
    else pendingRef.current[code] = memo;
    writeJson(MEMO_PENDING_KEY, pendingRef.current);
    setPendingCodes(Object.keys(pendingRef.current));
  }

  function updateProducts(update: (items: LiveProduct[]) => LiveProduct[]) {
    setProducts((prev) => {
      const next = update(prev);
      writeJson(PRODUCTS_CACHE_KEY, { items: next, savedAt: savedAtRef.current });
      return next;
    });
  }

  function syncMemo(code: string) {
    const memo = pendingRef.current[code];
    if (memo === undefined) return;
    setMemoFailed((prev) => prev.filter((c) => c !== code));
    fetch('/api/live-memo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, memo })
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error);
        // 저장하는 사이에 또 고쳤으면 그 새 메모는 계속 대기시킨다.
        if (pendingRef.current[code] === memo) setPending(code, null);
        updateProducts((items) => items.map((p) => (p.code === code ? { ...p, memoUpdatedAt: data.updatedAt ?? Date.now() } : p)));
      })
      .catch(() => setMemoFailed((prev) => (prev.includes(code) ? prev : [...prev, code])));
  }

  function saveMemo(code: string, memo: string) {
    const trimmedMemo = memo.trim();
    updateProducts((items) => items.map((p) => (p.code === code ? { ...p, memo: trimmedMemo } : p)));
    setPending(code, trimmedMemo);
    syncMemo(code);
  }

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 저장 공간을 못 쓰는 환경이어도 화면은 계속 동작하게 둔다.
    }
  }, [state, hydrated]);

  function loadProducts() {
    setRefreshing(true);
    setError('');
    fetch(`/api/meeting-products${bulkRef.current ? '?bulk=1' : ''}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error || '상품을 불러오지 못했습니다.');
        const now = Date.now();
        const items = withPendingMemos(data.items);
        savedAtRef.current = now;
        setSavedAt(now);
        setProducts(items);
        setMemosAvailable(data.memosAvailable !== false);
        writeJson(PRODUCTS_CACHE_KEY, { items, savedAt: now });
        // 전에 못 올린 메모가 있으면 이참에 다시 올린다.
        Object.keys(pendingRef.current).forEach(syncMemo);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }

  const byCode = useMemo(() => new Map(products.map((p) => [p.code, p])), [products]);
  const doneSet = new Set(state.done);
  const current = byCode.get(state.current);
  const doneCount = products.filter((p) => doneSet.has(p.code)).length;

  // 정렬만 적용한 전체 순서 — 방송 순서 모드면 방송 순서에 넣은 상품만
  const sorted = useMemo(() => {
    const list = [...products];
    if (state.sort === 'code') list.sort(compareCode);
    // 가격 미정(0)은 낮은 가격순에서도 맨 뒤로
    if (state.sort === 'priceAsc')
      list.sort((a, b) => (a.price || Infinity) - (b.price || Infinity) || compareCode(a, b));
    if (state.sort === 'priceDesc') list.sort((a, b) => b.price - a.price || compareCode(a, b));
    return list;
  }, [products, state.sort]);

  const trimmed = query.trim().toLowerCase();
  // 띄어쓰기로 나눈 단어가 품번·상품명·옵션·설명 어디에든(순서 상관없이) 들어 있으면 찾는다. 붙여 쓴 상품명('실버925')도 찾는다.
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const matchesText = (p: LiveProduct) => {
    if (tokens.length === 0) return true;
    const hay = [p.code, p.name, p.option1, p.option2, p.description].join(' ').toLowerCase();
    const flat = hay.replace(/\s+/g, '');
    return tokens.every((t) => hay.includes(t) || flat.includes(t));
  };
  // 검색은 정렬 모드와 상관없이 전체 상품에서 찾는다.
  const base = tokens.length > 0 ? [...products].sort(compareCode).filter(matchesText) : sorted;

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of base) counts.set(categoryOf(p.name), (counts.get(categoryOf(p.name)) ?? 0) + 1);
    return CATEGORY_ORDER.filter((c) => counts.has(c)).map((c) => ({ name: c, count: counts.get(c)! }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base.length, sorted, query]);
  const category = categories.some((c) => c.name === state.category) ? state.category : 'all';
  const materials = MATERIALS.map((m) => ({ name: m, count: base.filter((p) => hasMaterial(p, m)).length })).filter((m) => m.count > 0);
  const material = materials.some((m) => m.name === state.material) ? state.material : 'all';
  const inCategory = base.filter(
    (p) => (category === 'all' || categoryOf(p.name) === category) && (material === 'all' || hasMaterial(p, material))
  );
  const visible = inCategory;
  const navList = inCategory;
  const navIndex = navList.findIndex((p) => p.code === state.current);
  const panelVisible = panelOpen;

  function patch(partial: Partial<CueState>) {
    setState((s) => ({ ...s, ...partial }));
  }

  function show(code: string) {
    patch({ current: code });
    setPanelOpen(false);
    searchRef.current?.blur();
  }

  function toggleCue(code: string) {
    setState((s) => ({ ...s, cue: s.cue.includes(code) ? s.cue.filter((c) => c !== code) : [...s.cue, code] }));
  }

  function move(code: string, delta: number) {
    setState((s) => {
      const idx = s.cue.indexOf(code);
      const target = idx + delta;
      if (idx < 0 || target < 0 || target >= s.cue.length) return s;
      const cue = [...s.cue];
      [cue[idx], cue[target]] = [cue[target], cue[idx]];
      return { ...s, cue };
    });
  }

  function toggleDone(code: string) {
    setState((s) => ({
      ...s,
      done: s.done.includes(code) ? s.done.filter((c) => c !== code) : [...s.done, code]
    }));
  }

  function goRelative(delta: number) {
    const target = navList[navIndex + delta];
    if (navIndex >= 0 && target) patch({ current: target.code });
  }

  // 방송 중 가장 많이 누르는 버튼: 지금 상품을 완료 처리하고 목록 순서상 다음 "안 한" 상품으로 넘어간다.
  function doneAndNext() {
    if (!current) return;
    const done = state.done.includes(current.code) ? state.done : [...state.done, current.code];
    const isTodo = (p: LiveProduct) => !done.includes(p.code);
    const next = navList.slice(navIndex + 1).find(isTodo) ?? navList.find(isTodo);
    setState((s) => ({ ...s, done, current: next ? next.code : s.current }));
  }

  const currentDone = current ? doneSet.has(current.code) : false;

  return (
    <div className="flex h-dvh flex-col bg-gray-100 text-gray-900">
      {/* 상단: 검색 + 화면 전환 */}
      <header className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white p-3">
        <div className="relative min-w-0 flex-1">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="🔍 상품명·품번 검색"
            className="w-full rounded-2xl border-2 border-gray-300 bg-gray-50 px-4 py-3 text-xl focus:border-gray-900 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-gray-300 px-3 py-1 text-lg font-bold text-white"
              aria-label="검색어 지우기"
            >
              ×
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setInternal((v) => !v)}
          className={`shrink-0 rounded-xl px-2 py-1 text-xs ${internal ? 'bg-amber-200 text-amber-900' : 'text-gray-300'}`}
        >
          내부
        </button>
        {panelVisible ? (
          current && (
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className="shrink-0 rounded-2xl bg-gray-100 px-4 py-3 text-xl font-bold text-gray-800 lg:hidden"
            >
              보던 상품 ▶
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="shrink-0 rounded-2xl bg-gray-900 px-4 py-3 text-xl font-bold text-white lg:hidden"
          >
            ◀ 목록
          </button>
        )}
      </header>

      {error && products.length > 0 && (
        <div className="flex shrink-0 items-center justify-between gap-2 bg-amber-100 px-4 py-2 text-base text-amber-900">
          <span>최신 상품을 못 불러와서 저장된 목록으로 보여주는 중이에요.</span>
          <button type="button" onClick={loadProducts} className="shrink-0 font-bold underline">
            다시 시도
          </button>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        {/* 목록 */}
        <aside
          className={`${panelVisible ? 'flex' : 'hidden'} absolute inset-0 z-30 flex-col bg-white lg:static lg:flex lg:w-[40%] lg:border-r lg:border-gray-200`}
        >
          <div className="shrink-0 space-y-2 border-b border-gray-100 px-3 pt-3 pb-3">
            {trimmed && (
              <p className="text-lg text-gray-500">
                &ldquo;{query.trim()}&rdquo; 검색 결과 {visible.length}개
              </p>
            )}
            <div className="flex gap-2 overflow-x-auto">
              {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
                <Chip key={mode} active={state.sort === mode} onClick={() => patch({ sort: mode })}>
                  {SORT_LABELS[mode]}
                </Chip>
              ))}
            </div>
            {categories.length > 1 && (
              <div className="flex gap-2 overflow-x-auto">
                <Chip active={category === 'all'} onClick={() => patch({ category: 'all' })} tone="light">
                  모든 종류
                </Chip>
                {categories.map((c) => (
                  <Chip key={c.name} active={category === c.name} onClick={() => patch({ category: c.name })} tone="light">
                    {c.name} {c.count}
                  </Chip>
                ))}
              </div>
            )}
            {materials.length > 0 && (
              <div className="flex gap-2 overflow-x-auto">
                <Chip active={material === 'all'} onClick={() => patch({ material: 'all' })} tone="light">
                  모든 소재
                </Chip>
                {materials.map((m) => (
                  <Chip key={m.name} active={material === m.name} onClick={() => patch({ material: m.name })} tone="light">
                    {m.name} {m.count}
                  </Chip>
                ))}
              </div>
            )}
            {internal && (
              <div className="space-y-1 rounded-2xl bg-amber-50 p-3 text-base text-amber-900">
                <p className="font-bold">내부용 (창고에 보여주기 전에 꺼 주세요)</p>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={!state.bulk}
                    onChange={() => {
                      bulkRef.current = false;
                      patch({ bulk: false });
                      loadProducts();
                    }}
                  />
                  3.5배 상품만 3.6배로 (낮게 잡은 상품은 기존 가격, 노란색 표시)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={state.bulk}
                    onChange={() => {
                      bulkRef.current = true;
                      patch({ bulk: true });
                      loadProducts();
                    }}
                  />
                  전부 3.6배로 일괄
                </label>
                <p className="text-sm">
                  낮게 잡은 상품 {products.filter((p) => p.low).length}개 · 원가 확인 필요 {products.filter((p) => p.odd).length}개
                  {refreshing ? ' · 불러오는 중...' : ''}
                </p>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto pb-6">
            {loading && products.length === 0 && <p className="px-4 py-6 text-xl text-gray-400">상품 불러오는 중...</p>}
            {!loading && visible.length === 0 && (
              <p className="px-4 py-6 text-xl leading-relaxed text-gray-500">
                {trimmed ? '찾는 상품이 없습니다.' : '해당하는 상품이 없습니다.'}
              </p>
            )}
            {visible.map((p) => {
              const isCurrent = p.code === state.current;
              const flagged = internal && (p.low || p.odd);
              return (
                <div
                  key={p.code}
                  className={`flex items-center gap-3 border-b border-gray-100 px-3 py-2 ${
                    isCurrent ? 'bg-amber-50' : ''
                  } ${flagged ? (p.odd ? 'border-l-8 border-l-red-500 bg-red-50' : 'border-l-8 border-l-amber-400 bg-amber-50') : ''}`}
                >
                  <button type="button" onClick={() => show(p.code)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <Thumb product={p} />
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-lg leading-snug font-semibold">
                        <span className="mr-1.5 text-xl font-black text-gray-900">{p.code}</span>
                        {p.name}
                      </p>
                      <p className="text-lg font-semibold text-rose-600">
                        {formatPrice(p.price)}
                      </p>
                      {flagged && (
                        <p className="text-sm text-amber-800">
                          {p.odd ? '원가·판매가 확인 필요' : '낮게 잡음'} · 기존 {formatPrice(p.origPrice)}
                        </p>
                      )}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </aside>

        {/* 크게 보기 */}
        <main className="flex min-w-0 flex-1 flex-col">
          {loading && products.length === 0 ? (
            <Center text="상품 불러오는 중..." />
          ) : error && products.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
              <p className="text-xl text-red-600">{error}</p>
              <button type="button" onClick={loadProducts} className="rounded-xl bg-gray-900 px-6 py-3 text-lg text-white">
                다시 불러오기
              </button>
            </div>
          ) : !current ? (
            <Center text="목록에서 상품을 누르면 여기에 크게 나옵니다." />
          ) : (
            <>
              <div ref={detailRef} className="flex-1 overflow-y-auto">
                <div className="mx-auto max-w-3xl p-4 sm:p-6">
                  {/* 사진이 제일 먼저, 최대한 크게. 순서·완료 표시는 사진 위에 작게 얹는다. */}
                  <div className="relative">
                    {current.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={current.imageUrl}
                        alt={current.name}
                        className="mx-auto max-h-[55dvh] w-full rounded-3xl bg-white object-contain shadow-sm"
                      />
                    ) : (
                      <div className="flex h-48 w-full items-center justify-center rounded-3xl bg-white text-2xl text-gray-400">
                        사진 없음
                      </div>
                    )}
                  </div>

                  {/* 방송에서 "몇 번 상품"으로 부르므로 품번을 상품명과 한 줄로 크게 */}
                  <h1 className="mt-5 flex items-start gap-3">
                    <span className="shrink-0 rounded-2xl bg-gray-900 px-4 py-1 text-4xl leading-tight font-black text-white sm:text-5xl">
                      {current.code}
                    </span>
                    <span className="text-3xl leading-tight font-bold break-keep sm:pt-1 sm:text-4xl">{current.name}</span>
                  </h1>
                  <p className="mt-2 text-4xl font-extrabold text-rose-600 sm:text-5xl">{formatPrice(current.price)}</p>
                  {internal && (
                    <p className="mt-4 rounded-xl bg-amber-50 p-3 text-base text-amber-900">
                      내부용 · 기존 판매가 {formatPrice(current.origPrice)}
                      {current.low ? ' · 낮게 잡은 상품' : ''}
                      {current.odd ? ' · 원가·판매가 확인 필요' : ''}
                    </p>
                  )}

                  <div className="mt-5 flex flex-col gap-3">
                    <OptionRow label="색상" values={splitOptions(current.option1)} />
                    <OptionRow label="사이즈" values={splitOptions(current.option2)} />
                  </div>

                  {current.description && (
                    <section className="mt-6">
                      <h2 className="mb-2 text-xl font-bold text-gray-500">상품설명</h2>
                      <p className="text-2xl leading-relaxed whitespace-pre-wrap break-keep">{current.description}</p>
                    </section>
                  )}
                </div>
              </div>

              {/* 하단 조작 버튼 — 방송 중 손이 바로 가도록 크게 */}
              <nav className="flex shrink-0 gap-2 border-t border-gray-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <NavBtn onClick={() => goRelative(-1)} disabled={navIndex <= 0} label="◀" />
                <div className="flex min-w-0 flex-1 items-center justify-center text-xl font-bold text-gray-500">
                  {navIndex >= 0 ? `${navIndex + 1} / ${navList.length}` : ''}
                </div>
                <NavBtn onClick={() => goRelative(1)} disabled={navIndex < 0 || navIndex >= navList.length - 1} label="▶" />
              </nav>
            </>
          )}
        </main>
      </div>

    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  tone = 'dark'
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: 'dark' | 'light';
}) {
  const activeClass = tone === 'dark' ? 'bg-gray-900 text-white' : 'bg-gray-700 text-white';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-xl px-3 py-2 text-lg font-bold whitespace-nowrap ${
        active ? activeClass : 'bg-gray-100 text-gray-600'
      }`}
    >
      {children}
    </button>
  );
}

function MemoStatus({
  pending,
  failed,
  available,
  updatedAt,
  onRetry
}: {
  pending: boolean;
  failed: boolean;
  available: boolean;
  updatedAt: number | null;
  onRetry: () => void;
}) {
  if (failed)
    return (
      <p className="mt-2 flex items-center gap-2 text-base font-semibold text-red-600">
        시트에 저장 못 함 (이 기기엔 저장됨)
        <button type="button" onClick={onRetry} className="underline">
          다시 시도
        </button>
      </p>
    );
  if (pending) return <p className="mt-2 text-base text-blue-700">시트에 저장 중...</p>;
  if (!available) return <p className="mt-2 text-base text-amber-700">시트 메모 기능 준비 전 — Apps Script 재배포가 필요해요.</p>;
  if (updatedAt) return <p className="mt-2 text-base text-blue-900/60">{formatSavedAt(updatedAt)} 시트에 저장됨</p>;
  return null;
}

function DoneBox({ done, onClick }: { done: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={done ? '완료 취소' : '완료'}
      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 text-3xl font-bold ${
        done ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 bg-white text-transparent'
      }`}
    >
      ✓
    </button>
  );
}

function Thumb({ product, dim }: { product: LiveProduct; dim?: boolean }) {
  return product.imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={product.imageUrl}
      alt=""
      loading="lazy"
      className={`h-20 w-20 shrink-0 rounded-xl bg-gray-100 object-cover ${dim ? 'opacity-40' : ''}`}
    />
  ) : (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-gray-200 text-xs text-gray-400">사진</div>
  );
}

function OptionRow({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xl font-bold text-gray-500">{label}</span>
      {values.map((v) => (
        <span key={v} className="rounded-xl border-2 border-gray-300 bg-white px-4 py-2 text-2xl font-semibold">
          {v}
        </span>
      ))}
    </div>
  );
}

function NavBtn({ onClick, label, disabled }: { onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-14 shrink-0 rounded-2xl bg-gray-100 py-4 text-2xl font-bold text-gray-700 disabled:opacity-30 sm:w-20"
    >
      {label}
    </button>
  );
}

function SmallBtn({ onClick, label, disabled, danger }: { onClick: () => void; label: string; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-12 w-12 rounded-xl text-xl font-bold disabled:opacity-25 ${
        danger ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-700'
      }`}
    >
      {label}
    </button>
  );
}

function Center({ text }: { text: string }) {
  return <div className="flex flex-1 items-center justify-center p-8 text-center text-2xl text-gray-400">{text}</div>;
}
