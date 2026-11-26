import type { Metadata } from 'next';
import MeetingCueSheet from '@/components/MeetingCueSheet';

export const metadata: Metadata = {
  title: '페이버 라이브 큐시트 (미팅)'
};

// 창고 미팅 때 화면에 띄우는 버전. 원가·메모 등 내부 정보는 내려주지 않는다.
export default function MeetingPage() {
  return <MeetingCueSheet />;
}
