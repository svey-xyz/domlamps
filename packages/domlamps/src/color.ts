// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
// If a copy of the MPL was not distributed with this file, You can obtain one at
// https://mozilla.org/MPL/2.0/.

/** Linear-light RGB, each channel 0–1. */
export type RGB = [number, number, number];

/** sRGB transfer function, inverted: an encoded channel (0–1) to linear light. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Linear light (0–1) back to an encoded sRGB channel. Matches the shader's 1/2.2 approximation. */
export function linearToSrgb(c: number): number {
  return Math.min(1, Math.max(0, c)) ** (1 / 2.2);
}

const SENTINEL = '#010203';
const MAX_CACHE = 512;
const cache = new Map<string, RGB>();
let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

function context(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
  if (ctx) return ctx;
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(1, 1)
      : Object.assign(document.createElement('canvas'), { width: 1, height: 1 });
  ctx = canvas.getContext('2d', { willReadFrequently: true }) as typeof ctx;
  return ctx;
}

/**
 * Resolves any CSS colour the browser understands (hex, rgb, hsl, oklch, named, color-mix…) to
 * linear RGB by painting it into a 1×1 canvas. Results are cached. Empty or invalid values return
 * `fallback`.
 */
export function linearColor(value: string | null | undefined, fallback: RGB = [1, 1, 1]): RGB {
  const key = value?.trim();
  if (!key) return fallback;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = context();
  if (!c) return fallback;

  c.fillStyle = SENTINEL;
  c.fillStyle = key; // an invalid colour is ignored, leaving the sentinel
  if (c.fillStyle === SENTINEL && key.toLowerCase() !== SENTINEL) return fallback;
  c.clearRect(0, 0, 1, 1);
  c.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = c.getImageData(0, 0, 1, 1).data;
  const rgb: RGB = [srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255)];
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(key, rgb);
  return rgb;
}
