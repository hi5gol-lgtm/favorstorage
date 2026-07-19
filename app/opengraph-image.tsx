import { ImageResponse } from 'next/og';

export const alt = 'FAVOR JEWELRY';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#111111',
        }}
      >
        <div
          style={{
            fontSize: 96,
            fontWeight: 700,
            color: '#ffffff',
            letterSpacing: 4,
          }}
        >
          FAVOR JEWELRY
        </div>
        <div
          style={{
            marginTop: 24,
            fontSize: 32,
            color: '#999999',
            letterSpacing: 2,
          }}
        >
          상품등록 툴
        </div>
      </div>
    ),
    { ...size }
  );
}
