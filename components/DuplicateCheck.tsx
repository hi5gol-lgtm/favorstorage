'use client';

import { useEffect, useState } from 'react';
import ConfirmModal from './ConfirmModal';

interface ProductItem {
  row: number;
  code: string;
  name: string;
  option1: string;
  option2: string;
  vendor: string;
  vendorCode: string;
  price: number;
  stock: number;
  imageUrl: string;
  description: string;
}

interface DuplicateGroup {
  key: string;
  items: ProductItem[];
}

// 같은 제품으로 보는 기준: 상품명 + 옵션1 + 옵션2 + 거래처가 모두 같을 때.
// 색상/사이즈가 다른 정상 상품은 옵션이 달라서 중복으로 잡히지 않는다.
function groupKeyOf(item: ProductItem): string {
  return [item.name, item.option1, item.option2, item.vendor]
    .map((field) => String(field || '').trim().replace(/\s+/g, ' ').toLowerCase())
    .join('|');
}

function findDuplicateGroups(items: ProductItem[]): DuplicateGroup[] {
  const byKey = new Map<string, ProductItem[]>();
  for (const item of items) {
    if (!String(item.name || '').trim()) continue; // 이름 없는 행은 중복 판단 대상이 아님
    const key = groupKeyOf(item);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(item);
    else byKey.set(key, [item]);
  }
  return [...byKey.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({
      key,
      // 품번이 작은 것(먼저 등록된 것)을 위에 둬서 기본 '남길 항목'으로 삼는다.
      items: [...group].sort((a, b) => Number(a.code) - Number(b.code))
    }));
}

export default function DuplicateCheck() {
  const [items, setItems] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [keepByKey, setKeepByKey] = useState<Record<string, number>>({});
  const [pendingGroup, setPendingGroup] = useState<DuplicateGroup | null>(null);
  const [cleaningKey, setCleaningKey] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState('');

  useEffect(() => {
    loadList();
  }, []);

  function loadList() {
    setLoading(true);
    setError('');
    fetch('/api/list')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setItems(data.items as ProductItem[]);
        else setError(data.error || '목록을 불러오지 못했습니다.');
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }

  const groups = findDuplicateGroups(items);

  function keepRowOf(group: DuplicateGroup): number {
    return keepByKey[group.key] ?? group.items[0].row;
  }

  async function deleteOthers(group: DuplicateGroup) {
    const keepRow = keepRowOf(group);
    // 행을 지우면 그 아래 행 번호가 하나씩 밀리므로, 큰 행부터 순서대로(동시 아님) 지운다.
    const targets = group.items
      .filter((it) => it.row !== keepRow)
      .sort((a, b) => b.row - a.row);

    setCleaningKey(group.key);
    setError('');
    let deleted = 0;
    try {
      for (const target of targets) {
        const res = await fetch('/api/delete-product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ row: target.row, productCode: target.code })
        });
        const data = await res.json();
        if (!data.ok) {
          setError(
            `품번 ${target.code} 삭제 실패: ${data.error || '알 수 없는 오류'}` +
              (deleted > 0 ? ` (${deleted}개는 삭제됨)` : '')
          );
          break;
        }
        deleted += 1;
      }
    } catch (err) {
      setError(`삭제 중 오류: ${String(err)}`);
    } finally {
      setCleaningKey(null);
      if (deleted > 0) setDoneMessage(`${deleted}개를 삭제했습니다.`);
      // 행 번호가 전부 바뀌었으므로 목록을 다시 불러온다.
      loadList();
    }
  }

  if (loading) return <p className="px-4 py-6 text-sm text-gray-500">불러오는 중...</p>;

  return (
    <div className="px-4 pb-10">
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {doneMessage && <p className="mb-3 text-sm text-green-700">{doneMessage}</p>}

      {groups.length === 0 ? (
        <p className="py-6 text-sm text-gray-500">
          같은 상품명·옵션·거래처로 두 번 이상 등록된 상품이 없습니다. (전체 {items.length}개 확인)
        </p>
      ) : (
        <>
          <p className="py-3 text-sm text-gray-600">
            중복으로 보이는 그룹 {groups.length}개 — 남길 것을 고르고 나머지를 삭제하세요. 지워진 품번은
            비워둔 채로 남고, 다른 상품의 번호는 바뀌지 않습니다.
          </p>
          <ul className="space-y-4">
            {groups.map((group) => {
              const keepRow = keepRowOf(group);
              const cleaning = cleaningKey === group.key;
              return (
                <li key={group.key} className="rounded-2xl border border-gray-200 p-3">
                  <p className="mb-2 text-sm font-semibold text-gray-900">
                    {group.items[0].name}
                    {group.items[0].option1 ? ` / ${group.items[0].option1}` : ''}
                    {group.items[0].option2 ? ` / ${group.items[0].option2}` : ''}
                    <span className="ml-1 font-normal text-gray-500">
                      ({group.items[0].vendor || '거래처 없음'} · {group.items.length}개)
                    </span>
                  </p>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.items.map((item) => (
                      <label
                        key={item.row}
                        className={`flex items-center gap-3 rounded-xl border p-2 ${
                          item.row === keepRow ? 'border-gray-900 bg-gray-50' : 'border-gray-200'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`keep-${group.key}`}
                          checked={item.row === keepRow}
                          onChange={() => setKeepByKey((prev) => ({ ...prev, [group.key]: item.row }))}
                          className="size-4 shrink-0"
                        />
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.imageUrl}
                            alt=""
                            loading="lazy"
                            className="size-14 shrink-0 rounded-lg bg-gray-100 object-cover"
                          />
                        ) : (
                          <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-gray-200 text-xs text-gray-400">
                            사진
                          </div>
                        )}
                        <span className="min-w-0 text-xs text-gray-600">
                          <span className="block text-sm font-medium text-gray-900">품번 {item.code}</span>
                          <span className="block">판매가 {Number(item.price || 0).toLocaleString()}원</span>
                          <span className="block">
                            {item.imageUrl ? '사진 있음' : '사진 없음'}
                            {item.description ? ' · 설명 있음' : ''}
                          </span>
                          {item.row === keepRow && <span className="block font-medium text-gray-900">남길 상품</span>}
                        </span>
                      </label>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setPendingGroup(group)}
                    disabled={cleaning}
                    className="mt-3 w-full rounded-xl bg-red-50 py-2.5 text-sm font-medium text-red-600 disabled:opacity-50 sm:w-auto sm:px-4"
                  >
                    {cleaning ? '삭제 중...' : `나머지 ${group.items.length - 1}개 삭제`}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {pendingGroup && (
        <ConfirmModal
          message={
            `남길 상품: 품번 ${
              pendingGroup.items.find((it) => it.row === keepRowOf(pendingGroup))?.code
            }\n\n삭제할 품번: ${pendingGroup.items
              .filter((it) => it.row !== keepRowOf(pendingGroup))
              .map((it) => it.code)
              .join(', ')}\n\n삭제하면 내부용·셀러용 시트와 사진 파일이 함께 지워집니다. 되돌릴 수 없습니다.`
          }
          confirmLabel="삭제"
          onConfirm={() => {
            const group = pendingGroup;
            setPendingGroup(null);
            deleteOthers(group);
          }}
          onCancel={() => setPendingGroup(null)}
        />
      )}
    </div>
  );
}
