import { DomLamps, type DomLampsOptions } from '../../src';

let current: DomLamps | null = null;

/** Lays out a scene (absolute px positions), starts an engine at full resolution and renders once. */
export function scene(html: string, options: DomLampsOptions = {}): DomLamps {
  document.documentElement.style.setProperty('--domlamps-ambient', 'black');
  document.body.style.cssText = 'margin:0;position:relative;min-height:100vh';
  document.body.innerHTML = html;
  current = new DomLamps({ scale: 1, disableWhen: false, ...options });
  if (!current.start()) throw new Error('WebGL2 unavailable in this browser');
  current.render();
  return current;
}

export function teardown(): void {
  current?.destroy();
  current = null;
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('style');
}

/** A box: footprint in CSS px, height `z`. */
export const box = (x: number, y: number, w: number, h: number, z: number, attrs = '') =>
  `<div data-box ${attrs} style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;--lamp-z:${z}"></div>`;

/** A point light centred on (x, y) at height z. Small emitter by default so shadow edges are crisp. */
export const light = (x: number, y: number, z: number, style = '', attrs = '') =>
  `<span data-light ${attrs} data-bloom="0" style="position:absolute;left:${x}px;top:${y}px;width:0;height:0;--lamp-height:${z};--lamp-radius:2000;--lamp-size:1;${style}"></span>`;

/** Reads the light map at CSS px (x, y): [r, g, b] in 0–255. */
export function pixel(engine: DomLamps, x: number, y: number): [number, number, number] {
  const src = engine.canvas;
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0);
  const s = engine.scale;
  const top = Number.parseFloat(src.style.top) || 0;
  const [r = 0, g = 0, b = 0] = ctx.getImageData(Math.round(x * s), Math.round((y - top) * s), 1, 1).data;
  return [r, g, b];
}

/** Mean of r, g, b at (x, y), 0–255. */
export const brightness = (engine: DomLamps, x: number, y: number) => {
  const [r, g, b] = pixel(engine, x, y);
  return (r + g + b) / 3;
};

export const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
