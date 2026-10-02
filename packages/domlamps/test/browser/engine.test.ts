import { afterEach, describe, expect, it, vi } from 'vitest';
import { DomLamps, INVALIDATE_EVENT, linearColor } from '../../src';
import '../../src/define';
import { box, brightness, light, nextFrame, scene, teardown } from './helpers';

afterEach(() => {
  teardown();
  vi.restoreAllMocks();
  document.documentElement.className = '';
});

describe('lifecycle', () => {
  it('mounts two aria-hidden canvases and marks the root', () => {
    const e = scene('');
    expect(document.querySelectorAll('canvas[aria-hidden="true"]')).toHaveLength(2);
    expect(e.canvas.className).toBe('domlamps-map');
    expect(getComputedStyle(e.canvas).mixBlendMode).toBe('multiply');
    expect(getComputedStyle(e.bloomCanvas).mixBlendMode).toBe('screen');
    expect(document.documentElement.classList.contains('domlamps-on')).toBe(true);
    expect(e.active).toBe(true);
  });

  it('cleans up on destroy, and destroy is idempotent', () => {
    const e = scene('');
    e.destroy();
    e.destroy();
    expect(document.querySelectorAll('canvas')).toHaveLength(0);
    expect(document.documentElement.classList.contains('domlamps-on')).toBe(false);
    expect(e.active).toBe(false);
  });

  it('start() is idempotent', () => {
    const e = scene('');
    expect(e.start()).toBe(true);
    expect(document.querySelectorAll('canvas')).toHaveLength(2);
  });

  it('leaves the page untouched without WebGL2', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const e = new DomLamps();
    expect(e.start()).toBe(false);
    expect(document.querySelectorAll('canvas')).toHaveLength(0);
    expect(document.documentElement.classList.contains('domlamps-on')).toBe(false);
  });

  it('setEnabled(false) hides the overlay without tearing down', () => {
    const e = scene('');
    e.setEnabled(false);
    expect(e.canvas.hidden).toBe(true);
    expect(e.active).toBe(false);
    expect(document.documentElement.classList.contains('domlamps-on')).toBe(false);
    e.setEnabled(true);
    expect(e.canvas.hidden).toBe(false);
  });

  it('switches itself off when the disableWhen query matches', () => {
    document.body.innerHTML = '';
    const e = new DomLamps({ disableWhen: '(min-width: 1px)' });
    expect(e.start()).toBe(true);
    expect(e.active).toBe(false);
    expect(e.canvas.hidden).toBe(true);
    e.destroy();
  });

  it('clamps setScale and resizes the canvas', () => {
    const e = scene('');
    e.setScale(0.05);
    expect(e.scale).toBe(0.2);
    expect(e.canvas.width).toBe(Math.round(document.documentElement.clientWidth * 0.2));
  });
});

describe('custom properties', () => {
  it('registers --lamp-* so they are typed and animatable', () => {
    scene('<div id="t" style="--lamp-z:5px;--lamp-dir:0.25turn;--lamp-color:red"></div>');
    const cs = getComputedStyle(document.getElementById('t')!);
    expect(cs.getPropertyValue('--lamp-z')).toBe('0'); // 5px is invalid for <number>: initial value
    expect(cs.getPropertyValue('--lamp-dir')).toBe('90deg');
    expect(cs.getPropertyValue('--lamp-color')).toBe('rgb(255, 0, 0)');
  });

  it('does not touch unprefixed custom properties', () => {
    scene('<div id="t" style="--radius:8px;--size:2rem"></div>');
    const cs = getComputedStyle(document.getElementById('t')!);
    expect(cs.getPropertyValue('--radius')).toBe('8px');
    expect(cs.getPropertyValue('--size')).toBe('2rem');
  });
});

describe('reactivity', () => {
  it('picks up boxes added after start', async () => {
    const e = scene(light(200, 300, 80));
    expect(brightness(e, 500, 300)).toBeGreaterThan(60);
    document.body.insertAdjacentHTML('beforeend', box(300, 250, 40, 100, 200));
    await nextFrame();
    expect(brightness(e, 500, 300)).toBeLessThan(6);
  });

  it('re-renders on style changes (moving a light)', async () => {
    const e = scene(light(100, 100, 60, '--lamp-radius:150', 'id="l"'));
    expect(brightness(e, 600, 400)).toBeLessThan(6);
    const l = document.getElementById('l')!;
    l.style.left = '600px';
    l.style.top = '400px';
    await nextFrame();
    expect(brightness(e, 600, 400)).toBeGreaterThan(60);
  });

  it(`re-renders on ${INVALIDATE_EVENT}`, async () => {
    const e = scene(light(400, 300, 100));
    const before = brightness(e, 700, 50);
    document.documentElement.style.setProperty('--domlamps-ambient', 'white');
    document.dispatchEvent(new Event(INVALIDATE_EVENT));
    await nextFrame();
    expect(brightness(e, 700, 50)).toBeGreaterThan(before + 100);
  });
});

describe('<dom-lamps>', () => {
  it('starts an engine while connected and applies the ambient attribute', () => {
    const el = document.createElement('dom-lamps');
    el.setAttribute('ambient', '#123456');
    el.setAttribute('scale', '0.25');
    document.body.append(el);
    expect(el.engine).not.toBeNull();
    expect(el.engine?.scale).toBe(0.25);
    expect(document.documentElement.style.getPropertyValue('--domlamps-ambient')).toBe('#123456');

    el.setAttribute('scale', '1');
    expect(el.engine?.scale).toBe(1);

    el.remove();
    expect(el.engine).toBeNull();
    expect(document.querySelectorAll('canvas')).toHaveLength(0);
  });
});

describe('linearColor', () => {
  it('resolves CSS colours to linear RGB', () => {
    expect(linearColor('#ffffff')).toEqual([1, 1, 1]);
    expect(linearColor('red')).toEqual([1, 0, 0]);
    const [g] = linearColor('rgb(128 128 128)');
    expect(g).toBeCloseTo(0.216, 2);
    const [r, , b] = linearColor('oklch(0.6 0.25 30)');
    expect(r).toBeGreaterThan(b);
  });

  it('returns the fallback for empty and invalid values', () => {
    expect(linearColor('', [0.1, 0.2, 0.3])).toEqual([0.1, 0.2, 0.3]);
    expect(linearColor('not-a-colour', [0.1, 0.2, 0.3])).toEqual([0.1, 0.2, 0.3]);
    expect(linearColor('#010203')[2]).toBeGreaterThan(0);
  });
});
