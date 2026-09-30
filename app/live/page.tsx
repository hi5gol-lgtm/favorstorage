import type { Metadata } from 'next';
import LiveCueSheet from '@/components/LiveCueSheet';

export const metadata: Metadata = {
  title: '라이브 큐시트'
};

// 방송 중 셀러/스탭이 볼 수 있는 화면이라 등록·목록 화면으로 가는 링크는 두지 않는다.
export default function LivePage() {
  return <LiveCueSheet />;
}
