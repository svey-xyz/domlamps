import { describe, expect, it } from 'vitest';
import { linearToSrgb, srgbToLinear } from '../../src/color';

describe('sRGB transfer', () => {
  it('maps the endpoints', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 10);
  });

  it('uses the linear segment near black', () => {
    expect(srgbToLinear(0.04)).toBeCloseTo(0.04 / 12.92, 10);
  });

  it('decodes mid grey to ~21.6% linear light', () => {
    expect(srgbToLinear(0.5)).toBeCloseTo(0.214, 3);
  });

  it('round-trips approximately (encode uses the 2.2 gamma the shader uses)', () => {
    for (const c of [0.1, 0.3, 0.5, 0.8]) expect(linearToSrgb(srgbToLinear(c))).toBeCloseTo(c, 1);
  });

  it('clamps when encoding', () => {
    expect(linearToSrgb(2)).toBe(1);
    expect(linearToSrgb(-1)).toBe(0);
  });
});
