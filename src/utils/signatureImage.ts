const loadImage = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('ไม่สามารถอ่านภาพลายเซ็นได้'));
  image.src = source;
});

export const normalizeSignatureDataUrl = async (source: string): Promise<string> => {
  const image = await loadImage(source);
  const scale = Math.min(1, 2000 / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const scan = document.createElement('canvas');
  scan.width = width; scan.height = height;
  const context = scan.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('อุปกรณ์นี้ไม่รองรับการปรับภาพลายเซ็น');
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const backgroundSamples: Array<[number, number, number]> = [];
  const samplePixel = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    if (pixels.data[index + 3] > 20) {
      backgroundSamples.push([pixels.data[index], pixels.data[index + 1], pixels.data[index + 2]]);
    }
  };
  const xStep = Math.max(1, Math.floor(width / 40));
  const yStep = Math.max(1, Math.floor(height / 40));
  for (let x = 0; x < width; x += xStep) { samplePixel(x, 0); samplePixel(x, height - 1); }
  for (let y = 0; y < height; y += yStep) { samplePixel(0, y); samplePixel(width - 1, y); }
  const background = backgroundSamples.length
    ? backgroundSamples.reduce((sum, color) => [sum[0] + color[0], sum[1] + color[1], sum[2] + color[2]], [0, 0, 0]).map(value => value / backgroundSamples.length)
    : [255, 255, 255];
  const backgroundLightness = (background[0] + background[1] + background[2]) / 3;
  let left = width; let top = height; let right = -1; let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = pixels.data[index + 3];
      if (alpha <= 20) continue;
      const red = pixels.data[index]; const green = pixels.data[index + 1]; const blue = pixels.data[index + 2];
      const lightness = (red + green + blue) / 3;
      const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
      const distanceFromBackground = Math.sqrt(
        ((red - background[0]) ** 2) + ((green - background[1]) ** 2) + ((blue - background[2]) ** 2)
      );
      const inkStrength = Math.max(backgroundLightness - lightness, saturation * 0.9, distanceFromBackground * 0.72);
      if (inkStrength > 24) {
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
        pixels.data[index + 3] = Math.min(alpha, Math.max(70, Math.round(((inkStrength - 18) / 34) * 255)));
      } else {
        pixels.data[index + 3] = 0;
      }
    }
  }
  if (right < left || bottom < top) throw new Error('ไม่พบเส้นลายเซ็นในภาพ กรุณาใช้ภาพที่ชัดเจน');
  context.putImageData(pixels, 0, 0);
  const margin = Math.max(3, Math.round(Math.max(right - left, bottom - top) * 0.04));
  left = Math.max(0, left - margin); top = Math.max(0, top - margin);
  right = Math.min(width - 1, right + margin); bottom = Math.min(height - 1, bottom + margin);
  const cropWidth = right - left + 1; const cropHeight = bottom - top + 1;
  const output = document.createElement('canvas');
  output.width = 900; output.height = 300;
  const outputContext = output.getContext('2d');
  if (!outputContext) throw new Error('อุปกรณ์นี้ไม่รองรับการปรับภาพลายเซ็น');
  const fit = Math.min(820 / cropWidth, 240 / cropHeight);
  const drawWidth = cropWidth * fit; const drawHeight = cropHeight * fit;
  outputContext.drawImage(scan, left, top, cropWidth, cropHeight, (900 - drawWidth) / 2, (300 - drawHeight) / 2, drawWidth, drawHeight);
  return output.toDataURL('image/png');
};
