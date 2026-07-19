'use client';

import { useEffect, useState } from 'react';
import { compressImage } from '@/lib/imageCompress';
import ConfirmModal from './ConfirmModal';

interface ProductItem {
  row: number;
  code: string;
  name: string;
  internalCode: string;
  vendor: string;
  cost: number;
  price: number;
  stock: number;
  imageUrl: string;
  description: string;
}

export default function ProductList() {
  const [items, setItems] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadingRow, setUploadingRow] = useState<number | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [deletingRow, setDeletingRow] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProductItem | null>(null);

  useEffect(() => {
    loadList();
  }, []);

  function loadList() {
    setLoading(true);
    fetch('/api/list')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setItems(data.items);
        } else {
          setError(data.error || '목록을 불러오지 못했습니다.');
        }
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }

  async function handleAddImage(item: ProductItem, file: File) {
    setUploadingRow(item.row);
    try {
      const compressed = await compressImage(file);
      const res = await fetch('/api/update-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          row: item.row,
          productCode: item.code,
          imageBase64: compressed.base64,
          imageMimeType: compressed.mimeType
        })
      });
      const data = await res.json();
      if (data.ok) {
        setItems((prev) =>
          prev.map((it) => (it.row === item.row ? { ...it, imageUrl: data.imageUrl } : it))
        );
      } else {
        setError(`사진 추가 실패: ${data.error || '알 수 없는 오류'}`);
      }
    } catch (err) {
      setError(`사진 처리 중 오류: ${String(err)}`);
    } finally {
      setUploadingRow(null);
    }
  }

  async function handleDeleteConfirm() {
    if (!pendingDelete) return;
    const item = pendingDelete;
    setPendingDelete(null);
    setDeletingRow(item.row);
    try {
      const res = await fetch('/api/delete-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ row: item.row, productCode: item.code })
      });
      const data = await res.json();
      if (data.ok) {
        setItems((prev) => prev.filter((it) => it.row !== item.row));
      } else {
        setError(`삭제 실패: ${data.error || '알 수 없는 오류'}`);
      }
    } catch (err) {
      setError(`삭제 중 오류: ${String(err)}`);
    } finally {
      setDeletingRow(null);
    }
  }

  if (loading) return <p className="px-4 py-6 text-sm text-gray-500">불러오는 중...</p>;
  if (error) return <p className="px-4 py-6 text-sm text-red-600">{error}</p>;

  const visibleItems = onlyMissing ? items.filter((it) => !it.imageUrl) : items;

  if (items.length === 0) return <p className="px-4 py-6 text-sm text-gray-500">등록된 상품이 없습니다.</p>;

  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-2 text-sm">
        <button
          type="button"
          onClick={() => setOnlyMissing(false)}
          className={`rounded-full px-3 py-1 ${!onlyMissing ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          전체 {items.length}
        </button>
        <button
          type="button"
          onClick={() => setOnlyMissing(true)}
          className={`rounded-full px-3 py-1 ${onlyMissing ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          사진 대기 {items.filter((it) => !it.imageUrl).length}
        </button>
      </div>

      {visibleItems.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-500">해당하는 상품이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {visibleItems.map((item) => (
            <li key={item.row} className="flex items-center gap-3 px-4 py-3">
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="h-16 w-16 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <label className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-[11px] text-gray-500 active:bg-gray-50">
                  {uploadingRow === item.row ? (
                    '업로드중'
                  ) : (
                    <>
                      <span className="text-lg leading-none">📷</span>
                      사진추가
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={uploadingRow !== null}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAddImage(item, file);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{item.name}</p>
                <p className="text-xs text-gray-500">
                  {item.code}
                  {item.vendor ? ` · ${item.vendor}` : ''}
                  {item.internalCode ? ` · ${item.internalCode}` : ''}
                </p>
                <p className="text-xs text-gray-700">
                  원가 {formatWon(item.cost)} → 판매가 {formatWon(item.price)}
                </p>
                <p className="text-xs text-gray-500">재고 {item.stock || 0}개</p>
                {item.description && (
                  <p className="mt-0.5 truncate text-xs text-gray-500">{item.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPendingDelete(item)}
                disabled={deletingRow !== null}
                className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-red-600 active:bg-red-50 disabled:opacity-50"
              >
                {deletingRow === item.row ? '삭제중' : '삭제'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {pendingDelete && (
        <ConfirmModal
          message={`"${pendingDelete.name}" 상품을 삭제하시겠습니까?\n내부용/셀러용 시트에서 모두 삭제되며 되돌릴 수 없습니다.`}
          confirmLabel="삭제"
          cancelLabel="취소"
          onConfirm={handleDeleteConfirm}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

function formatWon(value: number) {
  if (!value) return '-';
  return Number(value).toLocaleString('ko-KR') + '원';
}
