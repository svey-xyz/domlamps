// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
// If a copy of the MPL was not distributed with this file, You can obtain one at
// https://mozilla.org/MPL/2.0/.

import type { RGB } from './color';
/**
 * DOM → scene. Pure functions that turn an element's layout rect, computed style and data
 * attributes into the records the shader consumes, and pack those records into GPU buffers.
 * Kept free of `document` / `window` so they can be unit-tested with plain objects.
 */
import { clamp, cornerRadius, parseNumber, readNumber, type StyleSource } from './parse';

export type MaterialName = 'solid' | 'glass' | 'paper' | 'emissive' | 'metal';
export type LightType = 'point' | 'spot' | 'sun';

export interface Material {
  /** Shader material id. */
  readonly id: number;
  /** Fraction of light blocked, 0–1. */
  readonly opacity: number;
  /** Specular strength of the top surface, 0–1. */
  readonly shine: number;
  /** Colour of transmitted light, linear RGB. */
  readonly tint: RGB;
}

export const MATERIALS: Readonly<Record<MaterialName, Material>> = {
  solid: { id: 0, opacity: 1, shine: 0, tint: [1, 1, 1] },
  glass: { id: 1, opacity: 0.3, shine: 0.35, tint: [1, 1, 1] },
  paper: { id: 2, opacity: 0.6, shine: 0, tint: [1, 0.93, 0.8] },
  emissive: { id: 3, opacity: 0, shine: 0, tint: [1, 1, 1] },
  metal: { id: 4, opacity: 1, shine: 0.8, tint: [1, 1, 1] },
};

export const LIGHT_TYPES: Readonly<Record<LightType, number>> = { point: 0, spot: 1, sun: 2 };

const DEG = Math.PI / 180;

export function resolveMaterial(name: string | undefined): Material {
  return name && Object.hasOwn(MATERIALS, name) ? MATERIALS[name as MaterialName] : MATERIALS.solid;
}

export function resolveLightType(name: string | undefined): LightType {
  return name && Object.hasOwn(LIGHT_TYPES, name) ? (name as LightType) : 'point';
}

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** What the scene readers need from an element. `HTMLElement` + `getComputedStyle` satisfy it. */
export interface ElementSample {
  rect: Rect;
  style: StyleSource;
  dataset: Readonly<Record<string, string | undefined>>;
}

/** Converts a CSS colour string to linear RGB; `fallback` when empty or unparseable. */
export type ColorResolver = (value: string, fallback?: RGB) => RGB;

/** Viewport → light-map coordinates: add `x` to viewport x, `y` to viewport y. */
export interface Origin {
  x: number;
  y: number;
}

// ---------------------------------------------------------------- boxes

export interface BoxRecord {
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
  z: number;
  radius: number;
  material: number;
  shine: number;
  /** Shadow tint (fraction of light let through per channel), or glow colour for emissive boxes. */
  transmit: RGB;
}

/** Returns null for boxes with no area (display: none, collapsed). */
export function readBox(s: ElementSample, origin: Origin, color: ColorResolver): BoxRecord | null {
  const { rect: r, style, dataset } = s;
  if (!(r.width > 0 && r.height > 0)) return null;
  const mat = resolveMaterial(dataset.material);
  const tint = color(style.getPropertyValue('--lamp-tint'), mat.tint);
  const isEmissive = mat.id === MATERIALS.emissive.id;
  const k = isEmissive ? parseNumber(dataset.glow, 1) : 1 - clamp(parseNumber(dataset.opacity, mat.opacity), 0, 1);
  return {
    cx: r.left + r.width / 2 + origin.x,
    cy: r.top + r.height / 2 + origin.y,
    halfW: r.width / 2,
    halfH: r.height / 2,
    z: readNumber(style, '--lamp-z', 0),
    radius: cornerRadius(style.getPropertyValue('border-top-left-radius'), r.width, r.height),
    material: mat.id,
    shine: parseNumber(dataset.shine, mat.shine),
    transmit: [tint[0] * k, tint[1] * k, tint[2] * k],
  };
}

/**
 * Packs a box into the `capacity × 3` RGBA32F box texture:
 * row 0 = centre + half size, row 1 = height, corner radius, material, shine, row 2 = transmit colour.
 */
export function writeBox(data: Float32Array, slot: number, capacity: number, b: BoxRecord): void {
  data.set([b.cx, b.cy, b.halfW, b.halfH], slot * 4);
  data.set([b.z, b.radius, b.material, b.shine], (capacity + slot) * 4);
  data.set([b.transmit[0], b.transmit[1], b.transmit[2], 0], (2 * capacity + slot) * 4);
}

/** Whether a box can affect a band of the given height (it may shadow from up to `reach` px outside it). */
export function boxNearBand(b: BoxRecord, bandHeight: number, reach: number): boolean {
  return b.cy + b.halfH >= -reach && b.cy - b.halfH <= bandHeight + reach;
}

// ---------------------------------------------------------------- lights

export interface LightRecord {
  type: LightType;
  x: number;
  y: number;
  /** Absolute height (owner box top + `--lamp-height`). */
  z: number;
  /** Falloff distance for point/spot lights; maximum shadow length for the sun. */
  radius: number;
  color: RGB;
  intensity: number;
  /** Radians. Spot aim, or the direction sunlight travels. */
  dir: number;
  /** Radians. Full spot cone angle. */
  cone: number;
  /** Radians. Sun elevation above the horizon. */
  elevation: number;
  /** Point/spot: emitter sphere radius, px. Sun: tangent of the angular radius. */
  size: number;
  /** Index of the box the light sits in (it never blocks its own light), or -1. */
  owner: number;
  /** Bloom size multiplier, 0 = none. */
  bloom: number;
}

export interface LightContext {
  origin: Origin;
  /** The nearest enclosing box, if any. */
  owner: { z: number; index: number } | null;
  /** Seconds; drives flicker. */
  time: number;
  /** False under prefers-reduced-motion. */
  flicker: boolean;
  /** Per-light phase offset so flickering lights don't pulse in sync. */
  seed: number;
  color: ColorResolver;
}

/** Returns null when the light is off (intensity ≈ 0). */
export function readLight(s: ElementSample, ctx: LightContext): LightRecord | null {
  const { rect: r, style, dataset } = s;
  let intensity = readNumber(style, '--lamp-intensity', 1);
  const flicker = clamp(parseNumber(dataset.flicker, 0), 0, 1);
  if (flicker && ctx.flicker) intensity *= 1 - flicker * flickerNoise(ctx.time + ctx.seed * 17.3);
  if (intensity <= 0.001) return null;

  const type = resolveLightType(dataset.light);
  const isSun = type === 'sun';
  const spread = Math.min(readNumber(style, '--lamp-spread', 2), 45);
  return {
    type,
    x: r.left + r.width / 2 + ctx.origin.x,
    y: r.top + r.height / 2 + ctx.origin.y,
    z: (ctx.owner?.z ?? 0) + readNumber(style, '--lamp-height', 80),
    radius: isSun ? parseNumber(dataset.reach, 1400) : readNumber(style, '--lamp-radius', 400),
    color: ctx.color(style.getPropertyValue('--lamp-color')),
    intensity,
    dir: readNumber(style, '--lamp-dir', 90) * DEG,
    cone: readNumber(style, '--lamp-cone', 50) * DEG,
    elevation: readNumber(style, '--lamp-elevation', 45) * DEG,
    size: isSun ? Math.tan(spread * DEG) : Math.max(0, readNumber(style, '--lamp-size', 12)),
    owner: ctx.owner?.index ?? -1,
    bloom: parseNumber(dataset.bloom, isSun ? 0 : 1),
  };
}

/** Whether a light can reach a band of the given height. The sun always can. */
export function lightReachesBand(l: LightRecord, bandHeight: number): boolean {
  return l.type === 'sun' || (l.y + l.radius >= 0 && l.y - l.radius <= bandHeight);
}

export interface LightBuffers {
  /** x, y, z, radius */
  position: Float32Array;
  /** linear r, g, b, intensity */
  color: Float32Array;
  /** dir.x, dir.y, cos(outer), cos(inner); the sun: direction toward the sun */
  shape: Float32Array;
  /** type, size, owner, elevation */
  meta: Float32Array;
}

export function createLightBuffers(capacity: number): LightBuffers {
  return {
    position: new Float32Array(capacity * 4),
    color: new Float32Array(capacity * 4),
    shape: new Float32Array(capacity * 4),
    meta: new Float32Array(capacity * 4),
  };
}

export function writeLight(buf: LightBuffers, slot: number, l: LightRecord): void {
  const o = slot * 4;
  buf.position.set([l.x, l.y, l.z, l.radius], o);
  if (l.type === 'sun') {
    // --lamp-dir is the direction light travels; the shader wants the direction toward the sun.
    buf.shape.set([-Math.cos(l.dir), -Math.sin(l.dir), 0, 0], o);
  } else {
    const half = l.cone / 2;
    buf.shape.set([Math.cos(l.dir), Math.sin(l.dir), Math.cos(half), Math.cos(half * 0.6)], o);
  }
  buf.color.set([l.color[0], l.color[1], l.color[2], l.intensity], o);
  buf.meta.set([LIGHT_TYPES[l.type], l.size, l.owner, l.elevation], o);
}

/** Smooth 0–1 value noise from a few incommensurate sines (candle flicker). */
export function flickerNoise(t: number): number {
  const v = Math.sin(t * 7.3) * 0.5 + Math.sin(t * 13.1 + 1.7) * 0.3 + Math.sin(t * 29.7 + 4.1) * 0.2;
  return (v + 1) / 2;
}
