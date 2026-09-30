/** Resolve any CSS colour (hex, rgb, oklch, named, color-mix…) to linear RGB via a 1×1 canvas. */

export type RGB = [number, number, number];

const cache = new Map<string, RGB>();
let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

function context() {
  if (ctx) return ctx;
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : Object.assign(document.createElement('canvas'), { width: 1, height: 1 });
  ctx = canvas.getContext('2d', { willReadFrequently: true }) as typeof ctx;
  return ctx!;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export function linearColor(value: string | null | undefined, fallback: RGB = [1, 1, 1]): RGB {
  const key = value?.trim();
  if (!key) return fallback;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = context();
  c.clearRect(0, 0, 1, 1);
  c.fillStyle = '#000';
  c.fillStyle = key; // invalid colours are ignored, leaving black
  c.fillRect(0, 0, 1, 1);
  const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
  const rgb: RGB = [toLinear(r / 255), toLinear(g / 255), toLinear(b / 255)];
  cache.set(key, rgb);
  return rgb;
}
