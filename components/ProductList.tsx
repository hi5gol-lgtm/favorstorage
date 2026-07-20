'use client';

import { useEffect, useState } from 'react';
import { compressImage } from '@/lib/imageCompress';
import ConfirmModal from './ConfirmModal';

interface ProductItem {
  row: number;
  code: string;
  name: string;
  option1: string;
  option2: string;
  internalCode: string;
  vendor: string;
  cost: number;
  price: number;
  stock: number;
  imageUrl: string;
  description: string;
}

interface EditDraft {
  code: string;
  name: string;
  option1: string;
  option2: string;
  description: string;
  internalCode: string;
  vendor: string;
  cost: string;
  price: string;
  stock: string;
}

function toDraft(item: ProductItem): EditDraft {
  return {
    code: item.code,
    name: item.name,
    option1: item.option1 || '',
    option2: item.option2 || '',
    description: item.description || '',
    internalCode: item.internalCode || '',
    vendor: item.vendor || '',
    cost: String(item.cost || ''),
    price: String(item.price || ''),
    stock: String(item.stock || '')
  };
}

export default function ProductList() {
  const [items, setItems] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadingRow, setUploadingRow] = useState<number | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [deletingRow, setDeletingRow] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProductItem | null>(null);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

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

  function startEdit(item: ProductItem) {
    setEditingRow(item.row);
    setEditDraft(toDraft(item));
  }

  function cancelEdit() {
    setEditingRow(null);
    setEditDraft(null);
  }

  async function saveEdit(item: ProductItem) {
    if (!editDraft || savingEdit) return;
    if (!editDraft.code.trim() || !editDraft.name.trim()) {
      setError('품번과 상품명은 필수입니다.');
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch('/api/update-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          row: item.row,
          originalCode: item.code,
          productCode: editDraft.code.trim(),
          productName: editDraft.name.trim(),
          productOption1: editDraft.option1.trim(),
          productOption2: editDraft.option2.trim(),
          productDescription: editDraft.description.trim(),
          internalCode: editDraft.internalCode.trim(),
          vendor: editDraft.vendor.trim(),
          cost: Number(editDraft.cost) || 0,
          price: Number(editDraft.price) || 0,
          stock: Number(editDraft.stock) || 0
        })
      });
      const data = await res.json();
      if (data.ok) {
        setItems((prev) =>
          prev.map((it) =>
            it.row === item.row
              ? {
                  ...it,
                  code: editDraft.code.trim(),
                  name: editDraft.name.trim(),
                  option1: editDraft.option1.trim(),
                  option2: editDraft.option2.trim(),
                  description: editDraft.description.trim(),
                  internalCode: editDraft.internalCode.trim(),
                  vendor: editDraft.vendor.trim(),
                  cost: Number(editDraft.cost) || 0,
                  price: Number(editDraft.price) || 0,
                  stock: Number(editDraft.stock) || 0
                }
              : it
          )
        );
        setEditingRow(null);
        setEditDraft(null);
      } else {
        setError(`수정 실패: ${data.error || '알 수 없는 오류'}`);
      }
    } catch (err) {
      setError(`수정 중 오류: ${String(err)}`);
    } finally {
      setSavingEdit(false);
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
            <li key={item.row} className="px-4 py-3">
              {editingRow === item.row && editDraft ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <EditField label="품번">
                      <input
                        value={editDraft.code}
                        onChange={(e) => setEditDraft({ ...editDraft, code: e.target.value })}
                        className="input"
                      />
                    </EditField>
                    <EditField label="상품명">
                      <input
                        value={editDraft.name}
                        onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                        className="input"
                      />
                    </EditField>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <EditField label="옵션1">
                      <input
                        value={editDraft.option1}
                        onChange={(e) => setEditDraft({ ...editDraft, option1: e.target.value })}
                        className="input"
                      />
                    </EditField>
                    <EditField label="옵션2">
                      <input
                        value={editDraft.option2}
                        onChange={(e) => setEditDraft({ ...editDraft, option2: e.target.value })}
                        className="input"
                      />
                    </EditField>
                  </div>
                  <EditField label="상품설명">
                    <textarea
                      value={editDraft.description}
                      onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                      className="input min-h-16 resize-y"
                    />
                  </EditField>
                  <div className="grid grid-cols-2 gap-2">
                    <EditField label="식별코드">
                      <input
                        value={editDraft.internalCode}
                        onChange={(e) => setEditDraft({ ...editDraft, internalCode: e.target.value })}
                        className="input"
                      />
                    </EditField>
                    <EditField label="거래처">
                      <input
                        value={editDraft.vendor}
                        onChange={(e) => setEditDraft({ ...editDraft, vendor: e.target.value })}
                        className="input"
                      />
                    </EditField>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <EditField label="원가">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={editDraft.cost}
                        onChange={(e) => setEditDraft({ ...editDraft, cost: e.target.value })}
                        className="input"
                      />
                    </EditField>
                    <EditField label="판매가">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={editDraft.price}
                        onChange={(e) => setEditDraft({ ...editDraft, price: e.target.value })}
                        className="input"
                      />
                    </EditField>
                    <EditField label="재고">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={editDraft.stock}
                        onChange={(e) => setEditDraft({ ...editDraft, stock: e.target.value })}
                        className="input"
                      />
                    </EditField>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => saveEdit(item)}
                      disabled={savingEdit}
                      className="flex-1 rounded-lg bg-gray-900 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {savingEdit ? '저장 중...' : '저장'}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={savingEdit}
                      className="flex-1 rounded-lg border border-gray-300 py-2 text-sm text-gray-600"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
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
                    <p className="truncate text-sm font-medium text-gray-900">
                      {item.name}
                      {(item.option1 || item.option2) && (
                        <span className="ml-1 text-xs font-normal text-gray-500">
                          ({[item.option1, item.option2].filter(Boolean).join(' / ')})
                        </span>
                      )}
                    </p>
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
                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      className="rounded-lg px-2 py-1.5 text-xs text-gray-600 active:bg-gray-100"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(item)}
                      disabled={deletingRow !== null}
                      className="rounded-lg px-2 py-1.5 text-xs text-red-600 active:bg-red-50 disabled:opacity-50"
                    >
                      {deletingRow === item.row ? '삭제중' : '삭제'}
                    </button>
                  </div>
                </div>
              )}
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

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function formatWon(value: number) {
  if (!value) return '-';
  return Number(value).toLocaleString('ko-KR') + '원';
}
