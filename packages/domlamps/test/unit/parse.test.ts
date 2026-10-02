import { describe, expect, it } from 'vitest';
import { clamp, cornerRadius, parseNumber, readNumber } from '../../src/parse';

const style = (values: Record<string, string>) => ({ getPropertyValue: (p: string) => values[p] ?? '' });

describe('readNumber', () => {
  it('parses numbers and computed angles', () => {
    expect(readNumber(style({ '--lamp-z': '42' }), '--lamp-z', 0)).toBe(42);
    expect(readNumber(style({ '--lamp-dir': '90deg' }), '--lamp-dir', 0)).toBe(90);
    expect(readNumber(style({ '--lamp-z': ' -12.5 ' }), '--lamp-z', 0)).toBe(-12.5);
  });

  it('falls back for missing or invalid values', () => {
    expect(readNumber(style({}), '--lamp-z', 7)).toBe(7);
    expect(readNumber(style({ '--lamp-z': 'tall' }), '--lamp-z', 7)).toBe(7);
  });
});

describe('parseNumber', () => {
  it.each([
    [undefined, 3],
    [null, 3],
    ['', 3],
    ['  ', 3],
    ['abc', 3],
    ['0', 0],
    ['0.25', 0.25],
    ['-1', -1],
  ])('%j -> %d', (input, expected) => {
    expect(parseNumber(input, 3)).toBe(expected);
  });
});

describe('cornerRadius', () => {
  it('uses px values as-is', () => expect(cornerRadius('8px', 100, 50)).toBe(8));
  it('resolves % against the shorter side', () => expect(cornerRadius('10%', 200, 100)).toBe(10));
  it('clamps to half the box (pills, circles)', () => {
    expect(cornerRadius('999px', 120, 40)).toBe(20);
    expect(cornerRadius('50%', 80, 80)).toBe(40);
  });
  it('uses the first value of an elliptical radius', () => expect(cornerRadius('6px 12px', 100, 100)).toBe(6));
  it('treats junk and negatives as square', () => {
    expect(cornerRadius('', 10, 10)).toBe(0);
    expect(cornerRadius('-4px', 10, 10)).toBe(0);
  });
});

describe('clamp', () => {
  it('clamps', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
});
