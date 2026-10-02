import { describe, expect, it } from 'vitest';
import type { RGB } from '../../src/color';
import {
  boxNearBand,
  createLightBuffers,
  type ElementSample,
  flickerNoise,
  LIGHT_TYPES,
  type LightContext,
  lightReachesBand,
  MATERIALS,
  readBox,
  readLight,
  resolveLightType,
  resolveMaterial,
  writeBox,
  writeLight,
} from '../../src/scene';

/** Colour stub: understands a few names, otherwise returns the fallback (like an invalid colour). */
const COLORS: Record<string, RGB> = { white: [1, 1, 1], red: [1, 0, 0], cyan: [0, 1, 1] };
const color = (v: string, fallback: RGB = [1, 1, 1]): RGB => COLORS[v.trim()] ?? fallback;

const sample = (
  props: Record<string, string> = {},
  dataset: Record<string, string> = {},
  rect = { left: 10, top: 20, width: 100, height: 40 },
): ElementSample => ({ rect, dataset, style: { getPropertyValue: (p) => props[p] ?? '' } });

const origin = { x: 0, y: 0 };

describe('resolveMaterial / resolveLightType', () => {
  it('resolves known names', () => {
    expect(resolveMaterial('glass')).toBe(MATERIALS.glass);
    expect(resolveLightType('spot')).toBe('spot');
  });

  it('defaults unknown names, including Object.prototype keys', () => {
    for (const name of [undefined, '', 'wood', 'constructor', 'toString', '__proto__']) {
      expect(resolveMaterial(name)).toBe(MATERIALS.solid);
      expect(resolveLightType(name)).toBe('point');
    }
  });
});

describe('readBox', () => {
  it('turns a rect into a centred footprint in band coordinates', () => {
    const b = readBox(sample({ '--lamp-z': '30' }), { x: 5, y: -100 }, color);
    expect(b).toMatchObject({ cx: 65, cy: -60, halfW: 50, halfH: 20, z: 30 });
  });

  it('skips boxes without area', () => {
    expect(readBox(sample({}, {}, { left: 0, top: 0, width: 0, height: 10 }), origin, color)).toBeNull();
  });

  it('solid boxes let no light through', () => {
    expect(readBox(sample(), origin, color)?.transmit).toEqual([0, 0, 0]);
  });

  it('glass transmits 70% of its tint by default', () => {
    const b = readBox(sample({ '--lamp-tint': 'cyan' }, { material: 'glass' }), origin, color);
    expect(b?.transmit[0]).toBeCloseTo(0);
    expect(b?.transmit[1]).toBeCloseTo(0.7);
    expect(b?.material).toBe(MATERIALS.glass.id);
  });

  it('data-opacity overrides the material and is clamped', () => {
    expect(readBox(sample({}, { material: 'glass', opacity: '0.9' }), origin, color)?.transmit[0]).toBeCloseTo(0.1);
    expect(readBox(sample({}, { material: 'glass', opacity: '7' }), origin, color)?.transmit[0]).toBe(0);
  });

  it('emissive boxes carry their glow colour scaled by data-glow', () => {
    const b = readBox(sample({ '--lamp-tint': 'red' }, { material: 'emissive', glow: '0.5' }), origin, color);
    expect(b?.transmit).toEqual([0.5, 0, 0]);
  });

  it('reads corner radius and per-material shine', () => {
    const b = readBox(sample({ 'border-top-left-radius': '50%' }, { material: 'metal' }), origin, color);
    expect(b?.radius).toBe(20);
    expect(b?.shine).toBe(MATERIALS.metal.shine);
  });
});

describe('writeBox', () => {
  it('packs three texture rows', () => {
    const cap = 4;
    const data = new Float32Array(cap * 4 * 3);
    writeBox(data, 1, cap, {
      cx: 1,
      cy: 2,
      halfW: 3,
      halfH: 4,
      z: 5,
      radius: 6,
      material: 1,
      shine: 0.5,
      transmit: [0.25, 0.5, 0.75],
    });
    expect([...data.slice(4, 8)]).toEqual([1, 2, 3, 4]);
    expect([...data.slice((cap + 1) * 4, (cap + 1) * 4 + 4)]).toEqual([5, 6, 1, 0.5]);
    expect([...data.slice((2 * cap + 1) * 4, (2 * cap + 1) * 4 + 4)]).toEqual([0.25, 0.5, 0.75, 0]);
  });
});

describe('boxNearBand', () => {
  const box = (cy: number) => readBox(sample({}, {}, { left: 0, top: cy - 10, width: 20, height: 20 }), origin, color)!;
  it('keeps boxes within reach of the band', () => {
    expect(boxNearBand(box(500), 1000, 700)).toBe(true);
    expect(boxNearBand(box(-650), 1000, 700)).toBe(true);
    expect(boxNearBand(box(1690), 1000, 700)).toBe(true);
  });
  it('drops boxes beyond reach', () => {
    expect(boxNearBand(box(-750), 1000, 700)).toBe(false);
    expect(boxNearBand(box(1800), 1000, 700)).toBe(false);
  });
});

describe('readLight', () => {
  const ctx = (over: Partial<LightContext> = {}): LightContext => ({
    origin,
    owner: null,
    time: 0,
    flicker: true,
    seed: 0,
    color,
    ...over,
  });
  const bulb = { left: 95, top: 95, width: 10, height: 10 };

  it('uses the registered defaults', () => {
    const l = readLight(sample({}, {}, bulb), ctx());
    expect(l).toMatchObject({
      type: 'point',
      x: 100,
      y: 100,
      z: 80,
      radius: 400,
      intensity: 1,
      size: 12,
      owner: -1,
      bloom: 1,
    });
  });

  it('places a nested light relative to its owner box top', () => {
    const l = readLight(sample({ '--lamp-height': '-12' }, {}, bulb), ctx({ owner: { z: 72, index: 3 } }));
    expect(l?.z).toBe(60);
    expect(l?.owner).toBe(3);
  });

  it('returns null for lights that are off', () => {
    expect(readLight(sample({ '--lamp-intensity': '0' }, {}, bulb), ctx())).toBeNull();
  });

  it('flickers only when motion is allowed', () => {
    const s = sample({ '--lamp-intensity': '1' }, { flicker: '0.5' }, bulb);
    const steady = readLight(s, ctx({ flicker: false }));
    expect(steady?.intensity).toBe(1);
    const values = [0, 0.3, 0.7, 1.1].map((time) => readLight(s, ctx({ time }))?.intensity ?? 0);
    for (const v of values) expect(v).toBeGreaterThanOrEqual(0.5 - 1e-9);
    expect(new Set(values).size).toBeGreaterThan(1);
  });

  it('reads angles in degrees and converts to radians', () => {
    const l = readLight(sample({ '--lamp-dir': '180deg', '--lamp-cone': '60deg' }, { light: 'spot' }, bulb), ctx());
    expect(l?.dir).toBeCloseTo(Math.PI);
    expect(l?.cone).toBeCloseTo(Math.PI / 3);
  });

  it('sun: size is tan(spread), radius is data-reach, no bloom by default', () => {
    const l = readLight(sample({ '--lamp-spread': '45deg' }, { light: 'sun', reach: '900' }, bulb), ctx());
    expect(l?.size).toBeCloseTo(1);
    expect(l?.radius).toBe(900);
    expect(l?.bloom).toBe(0);
  });

  it('clamps negative emitter sizes to 0', () => {
    expect(readLight(sample({ '--lamp-size': '-5' }, {}, bulb), ctx())?.size).toBe(0);
  });
});

describe('lightReachesBand', () => {
  const at = (y: number, type: 'point' | 'sun' = 'point') =>
    readLight(sample({ '--lamp-radius': '100' }, { light: type }, { left: 0, top: y, width: 0, height: 0 }), {
      origin,
      owner: null,
      time: 0,
      flicker: false,
      seed: 0,
      color,
    })!;
  it('culls point lights whose radius misses the band', () => {
    expect(lightReachesBand(at(-50), 500)).toBe(true);
    expect(lightReachesBand(at(-150), 500)).toBe(false);
    expect(lightReachesBand(at(650), 500)).toBe(false);
  });
  it('never culls the sun', () => expect(lightReachesBand(at(-5000, 'sun'), 500)).toBe(true));
});

describe('writeLight', () => {
  const base = {
    x: 1,
    y: 2,
    z: 3,
    radius: 400,
    color: [0.5, 0.25, 1] as RGB,
    intensity: 2,
    dir: 0,
    cone: Math.PI / 2,
    elevation: 0.5,
    size: 12,
    owner: 4,
    bloom: 1,
  };

  it('packs point/spot lights with the spot cone cosines', () => {
    const buf = createLightBuffers(2);
    writeLight(buf, 1, { ...base, type: 'spot' });
    expect([...buf.position.slice(4)]).toEqual([1, 2, 3, 400]);
    expect([...buf.color.slice(4)]).toEqual([0.5, 0.25, 1, 2]);
    const [dx, dy, outer, inner] = buf.shape.slice(4);
    expect([dx, dy]).toEqual([1, 0]);
    expect(outer).toBeCloseTo(Math.cos(Math.PI / 4));
    expect(inner).toBeCloseTo(Math.cos((Math.PI / 4) * 0.6));
    expect([...buf.meta.slice(4)]).toEqual([LIGHT_TYPES.spot, 12, 4, 0.5]);
  });

  it('packs the sun direction toward the sun (opposite to travel)', () => {
    const buf = createLightBuffers(1);
    writeLight(buf, 0, { ...base, type: 'sun', dir: Math.PI / 2 });
    expect(buf.shape[0]).toBeCloseTo(0);
    expect(buf.shape[1]).toBeCloseTo(-1);
    expect(buf.meta[0]).toBe(LIGHT_TYPES.sun);
  });
});

describe('flickerNoise', () => {
  it('stays within 0–1', () => {
    for (let t = 0; t < 50; t += 0.137) {
      const v = flickerNoise(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
