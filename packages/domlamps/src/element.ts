// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
// If a copy of the MPL was not distributed with this file, You can obtain one at
// https://mozilla.org/MPL/2.0/.

import { DomLamps } from './engine';

/** `HTMLElement` in the browser; an inert stand-in during SSR so importing this module never throws. */
const ElementBase: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

/**
 * `<dom-lamps>`: mounts one engine for the page while it is connected.
 *
 * ```html
 * <dom-lamps scale="0.5" ambient="#1b1e26"></dom-lamps>
 * ```
 *
 * - `scale`: light-map resolution (0.2–1). Live.
 * - `ambient`: any CSS colour, written to `--domlamps-ambient` on `:root`. Live. Omit it to set the
 *   variable from your own CSS instead.
 * - `band`: canvas band height in viewports. Read once on connect.
 */
export class DomLampsElement extends ElementBase {
  static readonly observedAttributes = ['scale', 'ambient'];

  /** The running engine, or null when disconnected or when WebGL2 is unavailable. */
  engine: DomLamps | null = null;

  connectedCallback(): void {
    this.style.display = 'contents';
    this.applyAmbient();
    const engine = new DomLamps({
      scale: Number(this.getAttribute('scale')) || undefined,
      band: Number(this.getAttribute('band')) || undefined,
    });
    this.engine = engine.start() ? engine : null;
  }

  disconnectedCallback(): void {
    this.engine?.destroy();
    this.engine = null;
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (!this.isConnected) return;
    if (name === 'scale' && value !== null && Number(value)) this.engine?.setScale(Number(value));
    if (name === 'ambient') {
      this.applyAmbient();
      this.engine?.invalidate(true);
    }
  }

  private applyAmbient(): void {
    const ambient = this.getAttribute('ambient');
    if (ambient) document.documentElement.style.setProperty('--domlamps-ambient', ambient);
  }
}

/** Defines `<dom-lamps>` (or a custom tag name). Safe to call more than once. */
export function defineDomLamps(tagName = 'dom-lamps'): void {
  if (typeof customElements === 'undefined' || customElements.get(tagName)) return;
  customElements.define(tagName, class extends DomLampsElement {});
}

declare global {
  interface HTMLElementTagNameMap {
    'dom-lamps': DomLampsElement;
  }
}
