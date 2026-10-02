import { describe, expect, it } from 'vitest';
import { type BandInput, bandHeight, bandIsCurrent, computeBand } from '../../src/band';

const input = (over: Partial<BandInput> = {}): BandInput => ({
  scrollY: 0,
  viewportHeight: 800,
  documentHeight: 10_000,
  documentWidth: 1200,
  factor: 3,
  scale: 0.5,
  maxTextureSize: 16_384,
  ...over,
});

describe('bandHeight', () => {
  it('is factor × viewport for long documents', () => expect(bandHeight(input())).toBe(2400));
  it('never exceeds the document', () => expect(bandHeight(input({ documentHeight: 900 }))).toBe(900));
  it('respects the GPU texture limit at the current scale', () => {
    expect(bandHeight(input({ maxTextureSize: 1024, scale: 0.5 }))).toBe(2048);
    expect(bandHeight(input({ maxTextureSize: 1024, scale: 1 }))).toBe(1024);
  });
  it('is at least 1px', () => expect(bandHeight(input({ documentHeight: 0 }))).toBe(1));
});

describe('computeBand', () => {
  it('starts at the top of the document', () => {
    expect(computeBand(input())).toEqual({ top: 0, height: 2400, width: 1200 });
  });

  it('centres on the viewport mid-document', () => {
    const b = computeBand(input({ scrollY: 5000 }));
    expect(b.top).toBe(5000 - (2400 - 800) / 2);
    expect(b.top + b.height / 2).toBe(5000 + 400); // band centre = viewport centre
  });

  it('clamps to the end of the document', () => {
    const b = computeBand(input({ scrollY: 9200 }));
    expect(b.top + b.height).toBe(10_000);
  });
});

describe('bandIsCurrent', () => {
  it('is current right after layout', () => {
    for (const scrollY of [0, 3000, 9200]) {
      const i = input({ scrollY });
      expect(bandIsCurrent(computeBand(i), i)).toBe(true);
    }
  });

  it('stays current while scrolling within the band', () => {
    const band = computeBand(input({ scrollY: 5000 })); // 4200..6600
    expect(bandIsCurrent(band, input({ scrollY: 4700 }))).toBe(true);
    expect(bandIsCurrent(band, input({ scrollY: 5300 }))).toBe(true);
  });

  it('goes stale within half a viewport of an inner edge', () => {
    const band = computeBand(input({ scrollY: 5000 })); // 4200..6600, edge 400
    expect(bandIsCurrent(band, input({ scrollY: 4500 }))).toBe(false);
    expect(bandIsCurrent(band, input({ scrollY: 5500 }))).toBe(false);
  });

  it('does not re-centre against the document edges', () => {
    const top = computeBand(input()); // 0..2400
    expect(bandIsCurrent(top, input({ scrollY: 0 }))).toBe(true);
    const bottom = computeBand(input({ scrollY: 9200 }));
    expect(bandIsCurrent(bottom, input({ scrollY: 9200 }))).toBe(true);
  });

  it('goes stale when the viewport or document width changes', () => {
    const band = computeBand(input());
    expect(bandIsCurrent(band, input({ documentWidth: 1000 }))).toBe(false);
    expect(bandIsCurrent(band, input({ viewportHeight: 700 }))).toBe(false);
  });
});
