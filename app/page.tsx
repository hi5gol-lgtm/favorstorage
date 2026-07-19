import Link from 'next/link';
import RegisterForm from '@/components/RegisterForm';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-md px-4 pt-3">
        <Link href="/list" className="text-sm text-gray-500 underline">
          등록된 상품 목록 보기 →
        </Link>
      </div>
      <RegisterForm />
    </div>
  );
}
