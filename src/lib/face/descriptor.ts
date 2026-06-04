/** Lightweight face fingerprint from canvas pixels (used when face-api models are not loaded). */

export function computeDescriptorFromDataUrl(dataUrl: string): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 32;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas not supported'));
        return;
      }
      ctx.drawImage(img, 0, 0, size, size);
      const pixels = ctx.getImageData(0, 0, size, size).data;
      const desc: number[] = [];
      for (let i = 0; i < pixels.length; i += 4) {
        desc.push((pixels[i] + pixels[i + 1] + pixels[i + 2]) / (3 * 255));
      }
      resolve(desc);
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

export function averageDescriptors(descriptors: number[][]): number[] {
  if (descriptors.length === 0) return [];
  const len = descriptors[0].length;
  const avg = new Array(len).fill(0);
  for (const d of descriptors) {
    for (let i = 0; i < len; i++) avg[i] += d[i] / descriptors.length;
  }
  return avg;
}
