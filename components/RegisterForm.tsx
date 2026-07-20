'use client';

import { useEffect, useRef, useState } from 'react';
import {
  calcAutoPrice,
  getMarginLevel,
  MARGIN_MESSAGES,
  VENDOR_CUSTOM_OPTION
} from '@/lib/constants';
import { compressImage } from '@/lib/imageCompress';
import ConfirmModal from './ConfirmModal';

interface PendingConfirm {
  message: string;
  resolve: (value: boolean) => void;
}

const DRAFT_KEY = 'registerFormDraft';

function loadDraft(): Record<string, string> | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function RegisterForm() {
  const [productCode, setProductCode] = useState('');
  const [productName, setProductName] = useState('');
  const [productOption1, setProductOption1] = useState('');
  const [productOption2, setProductOption2] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [internalCode, setInternalCode] = useState('');

  const [vendors, setVendors] = useState<string[]>([]);
  const [vendorSelect, setVendorSelect] = useState('');
  const [customVendor, setCustomVendor] = useState('');

  const [cost, setCost] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');

  const [imagePreview, setImagePreview] = useState('');
  const [imageBase64, setImageBase64] = useState('');
  const [imageMimeType, setImageMimeType] = useState('');

  const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);
  const [curationTips, setCurationTips] = useState<string[]>([]);
  const [suggestingName, setSuggestingName] = useState(false);
  const [suggestError, setSuggestError] = useState('');

  const [duplicateHint, setDuplicateHint] = useState<{ name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  const duplicateCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstSave = useRef(true);

  useEffect(() => {
    fetch('/api/vendors')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setVendors(data.vendors as string[]);
      })
      .catch(() => {});
  }, []);

  // 모바일에서 카메라 앱을 열면 브라우저가 탭을 백그라운드로 보내고,
  // 메모리 부족 시 복귀할 때 페이지가 새로고침되어 입력 중이던 내용이 사라질 수 있음.
  // sessionStorage에 임시 저장해두고 복귀 시 복원한다.
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      setProductCode(draft.productCode ?? '');
      setProductName(draft.productName ?? '');
      setProductOption1(draft.productOption1 ?? '');
      setProductOption2(draft.productOption2 ?? '');
      setProductDescription(draft.productDescription ?? '');
      setInternalCode(draft.internalCode ?? '');
      setVendorSelect(draft.vendorSelect ?? '');
      setCustomVendor(draft.customVendor ?? '');
      setCost(draft.cost ?? '');
      setPrice(draft.price ?? '');
      setStock(draft.stock ?? '');
      setImagePreview(draft.imagePreview ?? '');
      setImageBase64(draft.imageBase64 ?? '');
      setImageMimeType(draft.imageMimeType ?? '');
    }
  }, []);

  useEffect(() => {
    if (isFirstSave.current) {
      isFirstSave.current = false;
      return;
    }
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          productCode,
          productName,
          productOption1,
          productOption2,
          productDescription,
          internalCode,
          vendorSelect,
          customVendor,
          cost,
          price,
          stock,
          imagePreview,
          imageBase64,
          imageMimeType
        })
      );
    } catch {
      // 저장 공간 부족 등은 무시 (임시 저장 실패해도 저장 기능 자체엔 영향 없음)
    }
  }, [
    productCode,
    productName,
    productOption1,
    productOption2,
    productDescription,
    internalCode,
    vendorSelect,
    customVendor,
    cost,
    price,
    stock,
    imagePreview,
    imageBase64,
    imageMimeType
  ]);

  const costNum = Number(cost) || 0;
  const priceNum = Number(price) || 0;
  const stockNum = Number(stock) || 0;
  const marginLevel = getMarginLevel(costNum, priceNum);

  function handleCostChange(value: string) {
    setCost(value);
    const num = Number(value) || 0;
    setPrice(num > 0 ? String(calcAutoPrice(num)) : '');
  }

  function scheduleDuplicateCheck(code: string) {
    if (duplicateCheckTimer.current) clearTimeout(duplicateCheckTimer.current);
    setDuplicateHint(null);
    if (!code.trim()) return;
    duplicateCheckTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/check-duplicate?code=${encodeURIComponent(code.trim())}`);
        const data = await res.json();
        if (data.ok && data.exists) setDuplicateHint({ name: data.name });
      } catch {
        // ignore
      }
    }, 400);
  }

  async function checkDuplicateNow(code: string): Promise<{ exists: boolean; name?: string }> {
    try {
      const res = await fetch(`/api/check-duplicate?code=${encodeURIComponent(code.trim())}`);
      const data = await res.json();
      if (data.ok) return { exists: !!data.exists, name: data.name };
    } catch {
      // ignore
    }
    return { exists: false };
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      setImageBase64(compressed.base64);
      setImageMimeType(compressed.mimeType);
      setImagePreview(compressed.previewUrl);
      setNameSuggestions([]);
      setCurationTips([]);
      setSuggestError('');
      requestNameSuggestions(compressed.base64, compressed.mimeType);
    } catch {
      setToast('이미지 처리에 실패했습니다. 다시 시도해주세요.');
    }
  }

  async function requestNameSuggestions(base64: string, mimeType: string) {
    setSuggestingName(true);
    setSuggestError('');
    try {
      const res = await fetch('/api/suggest-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, imageMimeType: mimeType })
      });
      const data = await res.json();
      if (data.ok) {
        setNameSuggestions(data.suggestions || []);
        setCurationTips(data.curationTips || []);
      } else {
        setSuggestError('상품명 제안을 받지 못했습니다.');
      }
    } catch {
      setSuggestError('상품명 제안 중 오류가 발생했습니다.');
    } finally {
      setSuggestingName(false);
    }
  }

  function askConfirm(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      setPendingConfirm({ message, resolve });
    });
  }

  function resolveConfirm(value: boolean) {
    pendingConfirm?.resolve(value);
    setPendingConfirm(null);
  }

  function resetForm() {
    setProductCode('');
    setProductName('');
    setProductOption1('');
    setProductOption2('');
    setProductDescription('');
    setInternalCode('');
    setVendorSelect('');
    setCustomVendor('');
    setCost('');
    setPrice('');
    setStock('');
    setImagePreview('');
    setImageBase64('');
    setImageMimeType('');
    setNameSuggestions([]);
    setCurationTips([]);
    setSuggestError('');
    setDuplicateHint(null);
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
  }

  async function handleSave() {
    if (saving) return;

    if (!productCode.trim() || !productName.trim()) {
      setToast('품번과 상품명은 필수입니다.');
      return;
    }

    const vendorValue = vendorSelect === VENDOR_CUSTOM_OPTION ? customVendor.trim() : vendorSelect;

    setSaving(true);
    try {
      const dup = await checkDuplicateNow(productCode);
      if (dup.exists) {
        const proceed = await askConfirm(
          `이미 등록된 품번입니다. 상품명: ${dup.name}\n같은 상품에 다른 옵션을 추가하는 경우라면 계속 진행하세요.\n그래도 저장하시겠습니까?`
        );
        if (!proceed) {
          setSaving(false);
          return;
        }
      }

      if (marginLevel === 'danger') {
        const proceed = await askConfirm('마진이 너무 낮습니다. 그래도 저장하시겠습니까?');
        if (!proceed) {
          setSaving(false);
          return;
        }
      }

      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productCode: productCode.trim(),
          productName: productName.trim(),
          productOption1: productOption1.trim(),
          productOption2: productOption2.trim(),
          productDescription: productDescription.trim(),
          internalCode: internalCode.trim(),
          vendor: vendorValue,
          cost: costNum,
          price: priceNum,
          stock: stockNum,
          imageBase64,
          imageMimeType
        })
      });
      const data = await res.json();
      if (!data.ok) {
        setToast(`저장 실패: ${data.error || '알 수 없는 오류'}`);
        return;
      }

      if (vendorValue && !vendors.includes(vendorValue)) {
        setVendors((prev) => [...prev, vendorValue]);
      }

      setToast('저장되었습니다.');
      resetForm();
    } catch (err) {
      setToast(`저장 중 오류가 발생했습니다: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="mx-auto max-w-md px-4 pb-28 pt-6">
      <h1 className="mb-6 text-lg font-bold text-gray-900">페이버주얼리 상품등록</h1>

      <div className="space-y-5">
        <Field label="품번" required>
          <input
            type="text"
            value={productCode}
            onChange={(e) => {
              setProductCode(e.target.value);
              scheduleDuplicateCheck(e.target.value);
            }}
            className="input"
            placeholder="예: 2026"
          />
          {duplicateHint && (
            <p className="mt-1 text-xs text-amber-600">
              ⚠ 이미 등록된 품번입니다. 상품명: {duplicateHint.name} (같은 상품의 다른 옵션이라면
              품번을 그대로 두고 옵션만 다르게 입력하세요)
            </p>
          )}
        </Field>

        <Field label="사진">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImageChange}
            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
          />
          {imagePreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imagePreview}
              alt="미리보기"
              className="mt-3 h-40 w-40 rounded-lg object-cover"
            />
          )}

          {suggestingName && (
            <p className="mt-2 text-xs text-gray-500">AI가 상품명을 분석하고 있습니다...</p>
          )}
          {suggestError && <p className="mt-2 text-xs text-red-600">{suggestError}</p>}

          {nameSuggestions.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-medium text-gray-500">AI 상품명 제안 (탭하면 적용)</p>
              <div className="flex flex-wrap gap-1.5">
                {nameSuggestions.map((name, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setProductName(name)}
                    className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 active:bg-gray-100"
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {curationTips.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 p-3">
              <p className="mb-1.5 text-xs font-medium text-amber-700">큐레이션 팁</p>
              <ul className="space-y-1 text-xs text-amber-800">
                {curationTips.map((tip, i) => (
                  <li key={i}>· {tip}</li>
                ))}
              </ul>
            </div>
          )}
        </Field>

        <Field label="상품명" required>
          <input
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            className="input"
            placeholder="예: 큐빅 진주 반지"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="옵션1">
            <input
              type="text"
              value={productOption1}
              onChange={(e) => setProductOption1(e.target.value)}
              className="input"
              placeholder="예: 실버"
            />
          </Field>
          <Field label="옵션2">
            <input
              type="text"
              value={productOption2}
              onChange={(e) => setProductOption2(e.target.value)}
              className="input"
              placeholder="예: S"
            />
          </Field>
        </div>

        <Field label="상품설명">
          <textarea
            value={productDescription}
            onChange={(e) => setProductDescription(e.target.value)}
            className="input min-h-24 resize-y"
            placeholder="상품 설명을 입력하세요"
          />
        </Field>

        <Field label="식별코드">
          <input
            type="text"
            value={internalCode}
            onChange={(e) => setInternalCode(e.target.value)}
            className="input"
            placeholder="내부 전용 코드"
          />
        </Field>

        <Field label="거래처">
          <select
            value={vendorSelect}
            onChange={(e) => setVendorSelect(e.target.value)}
            className="input"
          >
            <option value="">선택하세요</option>
            {vendors.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
            <option value={VENDOR_CUSTOM_OPTION}>+ 직접입력</option>
          </select>
          {vendorSelect === VENDOR_CUSTOM_OPTION && (
            <input
              type="text"
              value={customVendor}
              onChange={(e) => setCustomVendor(e.target.value)}
              className="input mt-2"
              placeholder="새 거래처명 입력"
            />
          )}
        </Field>

        <Field label="원가">
          <input
            type="number"
            inputMode="numeric"
            value={cost}
            onChange={(e) => handleCostChange(e.target.value)}
            className="input"
            placeholder="0"
          />
        </Field>

        <Field label="판매가">
          <input
            type="number"
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="input"
            placeholder="0"
          />
          {marginLevel !== 'unknown' && (
            <p
              className={
                'mt-1 text-xs font-medium ' +
                (marginLevel === 'safe'
                  ? 'text-green-600'
                  : marginLevel === 'warn'
                  ? 'text-amber-600'
                  : 'text-red-600')
              }
            >
              {MARGIN_MESSAGES[marginLevel]}
            </p>
          )}
        </Field>

        <Field label="재고">
          <input
            type="number"
            inputMode="numeric"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            className="input"
            placeholder="0"
          />
        </Field>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-md">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-xl bg-gray-900 py-3.5 text-base font-semibold text-white disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {pendingConfirm && (
        <ConfirmModal
          message={pendingConfirm.message}
          onConfirm={() => resolveConfirm(true)}
          onCancel={() => resolveConfirm(false)}
        />
      )}
    </div>
  );
}

function Field({
  label,
  required,
  children
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}
