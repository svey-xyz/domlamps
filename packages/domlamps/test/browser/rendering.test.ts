/**
 * The height rules, checked against real WebGL2 output. Each test builds a tiny top-down scene,
 * renders it at full resolution with a black ambient, and samples the light map.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { box, brightness, light, pixel, scene, teardown } from './helpers';

afterEach(teardown);

const LIT = 60;
const DARK = 6;

describe('lighting', () => {
  it('lights the floor under a light and fades with distance', () => {
    const e = scene(light(400, 300, 200, '--lamp-radius:600'));
    const under = brightness(e, 400, 300);
    const near = brightness(e, 550, 300);
    expect(under).toBeGreaterThan(150);
    expect(near).toBeLessThan(under);
    expect(near).toBeGreaterThan(LIT);
  });

  it('leaves everything beyond the radius at the ambient colour', () => {
    const e = scene(light(100, 100, 40, '--lamp-radius:120'));
    expect(brightness(e, 700, 500)).toBeLessThan(DARK);
  });

  it('adds coloured lights in linear light', () => {
    const e = scene(light(400, 300, 150, '--lamp-color:red'));
    const [r, g, b] = pixel(e, 400, 300);
    expect(r).toBeGreaterThan(150);
    expect(g).toBeLessThan(DARK);
    expect(b).toBeLessThan(DARK);
  });
});

describe('height rules', () => {
  it('rule 1/2: a top below the light is lit, a top above it is not', () => {
    const e = scene(box(450, 250, 100, 100, 60) + box(450, 400, 100, 100, 120) + light(380, 360, 90));
    expect(brightness(e, 500, 300)).toBeGreaterThan(LIT); // z 60 < 90
    expect(brightness(e, 500, 450)).toBeLessThan(DARK); // z 120 > 90
  });

  it('rule 2: a light far below a top never lights it (horizon clamp)', () => {
    // Light at z 20 right beside a z 300 block: the top is far below the light's horizon.
    const e = scene(box(400, 250, 100, 100, 300) + light(390, 300, 20, '--lamp-size:30'));
    expect(brightness(e, 420, 300)).toBeLessThan(DARK);
  });

  it('rule 3: a block taller than the light blocks it completely', () => {
    const e = scene(box(300, 250, 40, 100, 200) + light(200, 300, 80));
    expect(brightness(e, 500, 300)).toBeLessThan(DARK); // behind the block
    expect(brightness(e, 100, 300)).toBeGreaterThan(LIT); // same distance, in front
  });

  it('rule 4: a shorter block casts a shadow d·h/(L−h) long', () => {
    // Light at x 200, z 100. Block's far edge at x 320 (d = 120), height 50: shadow ends at 200 + 240 = 440.
    const scn = box(300, 280, 20, 40, 50);
    const low = scene(scn + light(200, 300, 100));
    expect(brightness(low, 425, 300)).toBeLessThan(DARK);
    expect(brightness(low, 460, 300)).toBeGreaterThan(LIT);
    teardown();

    // Raise the light to z 200: 120·50/150 = 40, so the shadow now ends at 360.
    const high = scene(scn + light(200, 300, 200));
    expect(brightness(high, 345, 300)).toBeLessThan(DARK);
    expect(brightness(high, 380, 300)).toBeGreaterThan(LIT);
  });

  it('rule 5: a light inside its own box is not blocked by it (a lantern)', () => {
    const lantern = `<div data-box data-material="glass" style="position:absolute;left:380px;top:280px;width:40px;height:40px;--lamp-z:40">
      <span data-light data-bloom="0" style="position:absolute;left:20px;top:20px;width:0;height:0;--lamp-height:-12;--lamp-radius:600;--lamp-size:4"></span>
    </div>`;
    const e = scene(lantern);
    for (const [x, y] of [
      [300, 300],
      [500, 300],
      [400, 200],
      [400, 400],
    ] as const) {
      expect(brightness(e, x, y)).toBeGreaterThan(LIT);
    }
  });

  it('a box beside a large light never shadows the far side of that light', () => {
    const e = scene(box(330, 250, 40, 100, 300) + light(400, 300, 60, '--lamp-size:60'));
    expect(brightness(e, 520, 300)).toBeGreaterThan(LIT);
  });
});

describe('materials', () => {
  const shadowOf = (attrs: string, style = '') =>
    scene(
      `<div data-box ${attrs} style="position:absolute;left:300px;top:250px;width:40px;height:100px;--lamp-z:200;${style}"></div>` +
        light(200, 300, 80),
    );

  it('solid blocks everything', () => {
    expect(brightness(shadowOf(''), 500, 300)).toBeLessThan(DARK);
  });

  it('paper lets some light through', () => {
    const v = brightness(shadowOf('data-material="paper"'), 500, 300);
    expect(v).toBeGreaterThan(DARK);
    expect(v).toBeLessThan(brightness(shadowOf('data-material="glass"'), 500, 300));
  });

  it('glass tints the light that passes through it', () => {
    const [r, g, b] = pixel(shadowOf('data-material="glass"', '--lamp-tint:cyan'), 500, 300);
    expect(r).toBeLessThan(DARK);
    expect(g).toBeGreaterThan(LIT);
    expect(b).toBeGreaterThan(LIT);
  });

  it('data-opacity overrides the material', () => {
    expect(brightness(shadowOf('data-material="glass" data-opacity="1"'), 500, 300)).toBeLessThan(DARK);
  });

  it('emissive boxes glow at their own colour with no lights at all', () => {
    const e = scene(
      box(100, 100, 100, 100, 10, 'data-material="emissive"').replace('--lamp-z:10', '--lamp-z:10;--lamp-tint:white'),
    );
    expect(brightness(e, 150, 150)).toBeGreaterThan(240);
    expect(brightness(e, 400, 400)).toBeLessThan(DARK);
  });
});
