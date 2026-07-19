const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.78;

export interface CompressedImage {
  base64: string;
  mimeType: string;
  previewUrl: string;
}

export async function compressImage(file: File): Promise<CompressedImage> {
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);

  let { width, height } = img;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    if (width >= height) {
      height = Math.round((height * MAX_DIMENSION) / width);
      width = MAX_DIMENSION;
    } else {
      width = Math.round((width * MAX_DIMENSION) / height);
      height = MAX_DIMENSION;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas context를 생성할 수 없습니다.');
  ctx.drawImage(img, 0, 0, width, height);

  const mimeType = 'image/jpeg';
  const outUrl = canvas.toDataURL(mimeType, JPEG_QUALITY);
  const base64 = outUrl.split(',')[1];

  return { base64, mimeType, previewUrl: outUrl };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
