// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
// If a copy of the MPL was not distributed with this file, You can obtain one at
// https://mozilla.org/MPL/2.0/.

/**
 * The light map is not the size of the document: it is a band a few viewports tall, absolutely
 * positioned in the document. Native scrolling moves it with the content, so scrolling costs
 * nothing until the viewport nears the band's edge, at which point the band is re-centred.
 */

export interface Band {
  /** Document y of the band's top edge, CSS px. */
  top: number;
  /** Band height, CSS px. */
  height: number;
  /** Band width (the document's client width), CSS px. */
  width: number;
}

export interface BandInput {
  scrollY: number;
  viewportHeight: number;
  documentHeight: number;
  documentWidth: number;
  /** Band height as a multiple of the viewport height. */
  factor: number;
  /** Light-map px per CSS px. */
  scale: number;
  /** `gl.MAX_TEXTURE_SIZE`: the canvas can't be taller than this in device px. */
  maxTextureSize: number;
}

export const EMPTY_BAND: Band = { top: 0, height: 0, width: 0 };

export function bandHeight(i: BandInput): number {
  return Math.max(
    1,
    Math.min(i.documentHeight, Math.round(i.viewportHeight * i.factor), Math.floor(i.maxTextureSize / i.scale)),
  );
}

/** A band of `bandHeight(i)` centred on the viewport, clamped to the document. */
export function computeBand(i: BandInput): Band {
  const height = bandHeight(i);
  const centred = Math.round(i.scrollY - (height - i.viewportHeight) / 2);
  const top = Math.max(0, Math.min(i.documentHeight - height, centred));
  return { top, height, width: i.documentWidth };
}

/**
 * Whether the current band still serves the viewport. It must be re-laid out when its size is
 * stale or when the viewport comes within half a viewport of an edge that isn't the document's.
 */
export function bandIsCurrent(band: Band, i: BandInput): boolean {
  if (band.height !== bandHeight(i) || band.width !== i.documentWidth) return false;
  const edge = i.viewportHeight * 0.5;
  const bottom = band.top + band.height;
  const topLimit = band.top + (band.top > 0 ? edge : 0);
  const bottomLimit = bottom - (bottom < i.documentHeight ? edge : 0);
  return i.scrollY >= topLimit - 1 && i.scrollY + i.viewportHeight <= bottomLimit + 1;
}
