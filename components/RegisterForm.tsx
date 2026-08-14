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

interface Draft {
  [key: string]: string | string[];
}

function loadDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function RegisterForm() {
  const [productCode, setProductCode] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [productName, setProductName] = useState('');
  const [option1Fields, setOption1Fields] = useState<string[]>(['', '']);
  const [option2Fields, setOption2Fields] = useState<string[]>(['']);
  const [productDescription, setProductDescription] = useState('');

  const [vendors, setVendors] = useState<string[]>([]);
  const [vendorSelect, setVendorSelect] = useState('');
  const [customVendor, setCustomVendor] = useState('');
  const [vendorCode, setVendorCode] = useState('');

  const [productionCost, setProductionCost] = useState('');
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

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  const [fileInputKey, setFileInputKey] = useState(0);

  const codeRequestSeq = useRef(0);
  const isFirstSave = useRef(true);

  const vendorValue = vendorSelect === VENDOR_CUSTOM_OPTION ? customVendor.trim() : vendorSelect;
  // 제작가는 자사(페이버) 제품에만 의미가 있음 — 외부 거래처 상품은 우리가 만드는 게 아니라서 해당 없음.
  const isFavorVendor = !vendorValue || vendorValue === '페이버';

  useEffect(() => {
    fetch('/api/vendors')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setVendors(data.vendors as string[]);
      })
      .catch(() => {});
  }, []);

  // 거래처가 바뀔 때마다 해당 거래처의 다음 품번을 미리 조회해 보여준다.
  // 실제 확정 번호는 저장 시 서버가 다시 계산하므로 여기서는 어디까지나 미리보기.
  useEffect(() => {
    const seq = ++codeRequestSeq.current;
    setCodeLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/next-code?vendor=${encodeURIComponent(vendorValue)}`);
        const data = await res.json();
        if (seq !== codeRequestSeq.current) return;
        if (data.ok) setProductCode(String(data.code));
      } catch {
        // ignore
      } finally {
        if (seq === codeRequestSeq.current) setCodeLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [vendorValue]);

  // 모바일에서 카메라 앱을 열면 브라우저가 탭을 백그라운드로 보내고,
  // 메모리 부족 시 복귀할 때 페이지가 새로고침되어 입력 중이던 내용이 사라질 수 있음.
  // sessionStorage에 임시 저장해두고 복귀 시 복원한다.
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      setProductName((draft.productName as string) ?? '');
      const savedOptions = draft.option1Fields as string[] | undefined;
      setOption1Fields(savedOptions && savedOptions.length > 0 ? savedOptions : ['', '']);
      const savedOption2 = draft.option2Fields as string[] | undefined;
      setOption2Fields(savedOption2 && savedOption2.length > 0 ? savedOption2 : ['']);
      setProductDescription((draft.productDescription as string) ?? '');
      setVendorSelect((draft.vendorSelect as string) ?? '');
      setCustomVendor((draft.customVendor as string) ?? '');
      setVendorCode((draft.vendorCode as string) ?? '');
      setProductionCost((draft.productionCost as string) ?? '');
      setCost((draft.cost as string) ?? '');
      setPrice((draft.price as string) ?? '');
      setStock((draft.stock as string) ?? '');
      setImagePreview((draft.imagePreview as string) ?? '');
      setImageBase64((draft.imageBase64 as string) ?? '');
      setImageMimeType((draft.imageMimeType as string) ?? '');
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
          productName,
          option1Fields,
          option2Fields,
          productDescription,
          vendorSelect,
          customVendor,
          vendorCode,
          productionCost,
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
    productName,
    option1Fields,
    option2Fields,
    productDescription,
    vendorSelect,
    customVendor,
    vendorCode,
    productionCost,
    cost,
    price,
    stock,
    imagePreview,
    imageBase64,
    imageMimeType
  ]);

  const productionCostNum = isFavorVendor ? Number(productionCost) || 0 : 0;
  const costNum = Number(cost) || 0;
  const priceNum = Number(price) || 0;
  // 재고를 비워두면 999(상시 재고로 간주)로 저장 — 실제로 수량 관리가 필요한 상품만 입력한다.
  const stockNum = stock.trim() === '' ? 999 : Number(stock) || 0;
  const marginLevel = getMarginLevel(costNum, priceNum);
  const multiplier =
    costNum > 0 && priceNum > 0 ? String(Math.round((priceNum / costNum) * 100) / 100) : null;

  function handleCostChange(value: string) {
    setCost(value);
    const num = Number(value) || 0;
    setPrice(num > 0 ? String(calcAutoPrice(num)) : '');
  }

  function updateOption1(index: number, value: string) {
    setOption1Fields((prev) => prev.map((v, i) => (i === index ? value : v)));
  }

  function addOption1Field() {
    setOption1Fields((prev) => [...prev, '']);
  }

  function removeOption1Field(index: number) {
    setOption1Fields((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function updateOption2(index: number, value: string) {
    setOption2Fields((prev) => prev.map((v, i) => (i === index ? value : v)));
  }

  function addOption2Field() {
    setOption2Fields((prev) => [...prev, '']);
  }

  function removeOption2Field(index: number) {
    setOption2Fields((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
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
    setProductName('');
    setOption1Fields(['', '']);
    setOption2Fields(['']);
    setProductDescription('');
    setVendorSelect('');
    setCustomVendor('');
    setVendorCode('');
    setProductionCost('');
    setCost('');
    setPrice('');
    setStock('');
    setImagePreview('');
    setImageBase64('');
    setImageMimeType('');
    setNameSuggestions([]);
    setCurationTips([]);
    setSuggestError('');
    setFileInputKey((k) => k + 1);
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
  }

  async function handleSave() {
    if (saving) return;

    if (!productName.trim()) {
      setToast('상품명은 필수입니다.');
      return;
    }

    const option1Value = option1Fields.map((v) => v.trim()).filter(Boolean).join(', ');
    const option2Value = option2Fields.map((v) => v.trim()).filter(Boolean).join(', ');

    setSaving(true);
    try {
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
          productName: productName.trim(),
          productOption1: option1Value,
          productOption2: option2Value,
          vendor: vendorValue,
          vendorCode: vendorCode.trim(),
          productionCost: productionCostNum,
          cost: costNum,
          price: priceNum,
          stock: stockNum,
          productDescription: productDescription.trim(),
          curationTip: curationTips.join('\n'),
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

      setToast(`저장되었습니다. (품번 ${data.productCode})`);
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
        <Field label="사진">
          <input
            key={fileInputKey}
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
            placeholder="AI 제안을 탭하거나 직접 입력하세요"
          />
        </Field>

        <Field label="옵션1 (색상)">
          <div className="space-y-2">
            {option1Fields.map((value, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="text"
                  value={value}
                  onChange={(e) => updateOption1(i, e.target.value)}
                  className="input flex-1"
                  placeholder="색상"
                />
                {option1Fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeOption1Field(i)}
                    className="shrink-0 rounded-lg border border-gray-300 px-3 text-gray-500 active:bg-gray-100"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addOption1Field}
              className="rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-500 active:bg-gray-50"
            >
              + 색상 추가
            </button>
          </div>
        </Field>

        <Field label="옵션2 (사이즈)">
          <div className="space-y-2">
            {option2Fields.map((value, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="text"
                  value={value}
                  onChange={(e) => updateOption2(i, e.target.value)}
                  className="input flex-1"
                  placeholder="없으면 비워두세요"
                />
                {option2Fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeOption2Field(i)}
                    className="shrink-0 rounded-lg border border-gray-300 px-3 text-gray-500 active:bg-gray-100"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addOption2Field}
              className="rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-500 active:bg-gray-50"
            >
              + 사이즈 추가
            </button>
          </div>
        </Field>

        <Field label="거래처">
          <select
            value={vendorSelect}
            onChange={(e) => setVendorSelect(e.target.value)}
            className="input"
          >
            <option value="">선택 안 함 (페이버)</option>
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

        <Field label="업체상품코드">
          <input
            type="text"
            value={vendorCode}
            onChange={(e) => setVendorCode(e.target.value)}
            className="input"
            placeholder="거래처 자체 상품코드 (선택)"
          />
        </Field>

        <Field label="품번 (자동 배정)">
          <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 py-2.5 text-lg font-bold tracking-wide text-gray-900">
            {codeLoading ? '계산 중...' : productCode}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            이 상품은 이 번호로 등록됩니다. 거래처에 따라 자동으로 매겨지며 직접 수정할 수 없습니다.
          </p>
        </Field>

        {isFavorVendor && (
          <Field label="제작가">
            <input
              type="number"
              inputMode="numeric"
              value={productionCost}
              onChange={(e) => setProductionCost(e.target.value)}
              className="input"
              placeholder="0"
            />
          </Field>
        )}

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
          <div className="mt-1 flex items-center gap-2">
            {marginLevel !== 'unknown' && (
              <p
                className={
                  'text-xs font-medium ' +
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
            {multiplier && <p className="text-xs text-gray-500">배수 {multiplier}배</p>}
          </div>
        </Field>

        <Field label="재고">
          <input
            type="number"
            inputMode="numeric"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            className="input"
            placeholder="비워두면 999 (상시 재고)"
          />
        </Field>

        <Field label="상품설명">
          <textarea
            value={productDescription}
            onChange={(e) => setProductDescription(e.target.value)}
            className="input min-h-24 resize-y"
            placeholder="소재, 사이즈 등 정보를 입력하세요"
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
