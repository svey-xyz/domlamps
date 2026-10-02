// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
// If a copy of the MPL was not distributed with this file, You can obtain one at
// https://mozilla.org/MPL/2.0/.

/**
 * The custom properties domlamps reads. They are registered (typed, non-inheriting) so CSS
 * transitions and keyframes can interpolate them, which is what lets plain CSS animate the lighting.
 *
 * Every name is prefixed with `--lamp-` so registering them can never change the meaning of a
 * host site's own custom properties.
 */
export interface LampProperty {
  readonly name: `--lamp-${string}`;
  readonly syntax: '<number>' | '<angle>' | '<color>' | '*';
  readonly initialValue?: string;
  /** What the property controls, for docs and tooling. */
  readonly description: string;
}

export const PROPERTIES = [
  // Boxes
  { name: '--lamp-z', syntax: '<number>', initialValue: '0', description: 'Box height above the floor, CSS px.' },
  // Lights
  {
    name: '--lamp-height',
    syntax: '<number>',
    initialValue: '80',
    description: "Light height, CSS px. Inside a box it is relative to that box's top (negative = inside it).",
  },
  { name: '--lamp-intensity', syntax: '<number>', initialValue: '1', description: 'Brightness multiplier.' },
  { name: '--lamp-radius', syntax: '<number>', initialValue: '400', description: 'Falloff distance, CSS px.' },
  { name: '--lamp-color', syntax: '<color>', initialValue: 'white', description: 'Light colour.' },
  {
    name: '--lamp-dir',
    syntax: '<angle>',
    initialValue: '90deg',
    description: 'Spot aim / sun travel direction (0 = right, 90deg = down).',
  },
  { name: '--lamp-cone', syntax: '<angle>', initialValue: '50deg', description: 'Spot cone angle.' },
  { name: '--lamp-elevation', syntax: '<angle>', initialValue: '45deg', description: 'Sun angle above the horizon.' },
  {
    name: '--lamp-size',
    syntax: '<number>',
    initialValue: '12',
    description: 'Point/spot emitter radius, CSS px. Bigger = softer light and shadows.',
  },
  {
    name: '--lamp-spread',
    syntax: '<angle>',
    initialValue: '2deg',
    description: 'Sun angular radius. Bigger = softer shadows.',
  },
] as const satisfies readonly LampProperty[];

export type LampPropertyName = (typeof PROPERTIES)[number]['name'];

/**
 * Registers every domlamps custom property with `CSS.registerProperty`. Safe to call more than once,
 * and a no-op where the API is missing (the bundled `domlamps.css` registers them with `@property` too).
 */
export function registerProperties(): void {
  if (typeof CSS === 'undefined' || typeof CSS.registerProperty !== 'function') return;
  for (const p of PROPERTIES) {
    try {
      CSS.registerProperty({ name: p.name, syntax: p.syntax, inherits: false, initialValue: p.initialValue });
    } catch {
      // Already registered (InvalidModificationError): nothing to do.
    }
  }
}
