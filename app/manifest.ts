import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '페이버주얼리 상품등록 툴',
    short_name: 'Favor',
    start_url: '/',
    display: 'standalone',
    background_color: '#D7F76C',
    theme_color: '#D7F76C',
    icons: [
      { src: '/icon', sizes: '32x32', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' }
    ]
  };
}
