// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
// If a copy of the MPL was not distributed with this file, You can obtain one at
// https://mozilla.org/MPL/2.0/.

/** Anything with `getPropertyValue`: a `CSSStyleDeclaration`, or a plain stub in tests. */
export interface StyleSource {
  getPropertyValue(property: string): string;
}

/** Reads a numeric custom property (angles are read in their computed unit, `deg`). */
export function readNumber(style: StyleSource, property: string, fallback: number): number {
  const v = Number.parseFloat(style.getPropertyValue(property));
  return Number.isFinite(v) ? v : fallback;
}

/** Parses a numeric data attribute; missing, empty or non-numeric values use the fallback. */
export function parseNumber(value: string | undefined | null, fallback: number): number {
  if (value === undefined || value === null || value.trim() === '') return fallback;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Resolves a computed `border-*-radius` (px or %) to px, clamped so it never exceeds half the box.
 * Elliptical radii (`10px 20px`) use the first value.
 */
export function cornerRadius(value: string, width: number, height: number): number {
  const first = value.trim().split(/\s+/)[0] ?? '';
  const v = Number.parseFloat(first) || 0;
  const px = first.endsWith('%') ? (v / 100) * Math.min(width, height) : v;
  return Math.max(0, Math.min(px, width / 2, height / 2));
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
