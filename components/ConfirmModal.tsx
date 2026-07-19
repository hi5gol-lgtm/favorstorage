'use client';

interface ConfirmModalProps {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  message,
  confirmLabel = '저장',
  cancelLabel = '취소',
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <p className="whitespace-pre-line text-[15px] leading-relaxed text-gray-800">{message}</p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-medium text-gray-700 active:bg-gray-100"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-gray-900 py-3 text-sm font-medium text-white active:bg-gray-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
