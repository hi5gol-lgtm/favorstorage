import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#D7F76C',
        }}
      >
        <div
          style={{
            fontSize: 40,
            fontWeight: 800,
            color: '#1a2e05',
            letterSpacing: 1,
          }}
        >
          FAVOR
        </div>
      </div>
    ),
    { ...size }
  );
}
