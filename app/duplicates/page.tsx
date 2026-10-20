import Link from 'next/link';
import DuplicateCheck from '@/components/DuplicateCheck';

export default function DuplicatesPage() {
  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="mx-auto max-w-md px-4 pt-6 lg:max-w-4xl">
        <Link href="/list" className="text-sm text-gray-500 underline">
          ← 상품 목록으로
        </Link>
        <h1 className="mt-3 mb-2 text-lg font-bold text-gray-900">중복 등록 점검</h1>
      </div>
      <div className="mx-auto max-w-md bg-white lg:max-w-4xl">
        <DuplicateCheck />
      </div>
    </div>
  );
}
