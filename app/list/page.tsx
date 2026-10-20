import Link from 'next/link';
import ProductList from '@/components/ProductList';

export default function ListPage() {
  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="mx-auto max-w-md px-4 pt-6 lg:max-w-4xl">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="text-sm text-gray-500 underline">
            ← 상품등록으로
          </Link>
          <Link href="/duplicates" className="text-sm text-gray-500 underline">
            중복 등록 점검 →
          </Link>
        </div>
        <h1 className="mt-3 mb-2 text-lg font-bold text-gray-900">등록된 상품</h1>
      </div>
      <div className="mx-auto max-w-md bg-white lg:max-w-4xl">
        <ProductList />
      </div>
    </div>
  );
}
