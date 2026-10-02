// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
// If a copy of the MPL was not distributed with this file, You can obtain one at
// https://mozilla.org/MPL/2.0/.

import { type Band, bandIsCurrent, computeBand, EMPTY_BAND } from './band';
import { linearColor, linearToSrgb } from './color';
import { clamp } from './parse';
import { registerProperties } from './properties';
import {
  type BoxRecord,
  boxNearBand,
  createLightBuffers,
  type ElementSample,
  type LightBuffers,
  type LightRecord,
  lightReachesBand,
  readBox,
  readLight,
  writeBox,
  writeLight,
} from './scene';
import { FRAG, MAX_BOXES, MAX_LIGHTS, VERT } from './shader';

/**
 * domlamps: 2.5D lighting for real DOM.
 *
 * The DOM is the scene: `[data-box]` elements are extruded boxes of height `--lamp-z`, and
 * `[data-light]` elements are lights. A WebGL2 fragment shader renders a light map into a canvas
 * that is multiplied over the page. Layout, scrolling, text, selection and events all stay native.
 */

export interface DomLampsOptions {
  /** Light-map resolution in canvas px per CSS px, 0.2–1. Light is low-frequency; 0.5 is plenty. @default 0.5 */
  scale?: number;
  /** Canvas band height as a multiple of the viewport, so native scrolling needs no re-render. @default 3 */
  band?: number;
  /**
   * Element the canvases are appended to. It must share the document's coordinate origin
   * (the body, or an element positioned at the document's top left). @default document.body
   */
  root?: HTMLElement;
  /**
   * Media query that switches the overlay off (the page renders fully lit). `false` never does.
   * @default '(forced-colors: active), (prefers-contrast: more)'
   */
  disableWhen?: string | false;
  /** Register the `--lamp-*` custom properties with `CSS.registerProperty`. @default true */
  registerProperties?: boolean;
}

export const DEFAULT_DISABLE_QUERY = '(forced-colors: active), (prefers-contrast: more)';

/** Event name: dispatch on `document` after changes the engine cannot observe. */
export const INVALIDATE_EVENT = 'domlamps:invalidate';

/** Boxes this far outside the band can still throw shadows into it. */
const BOX_REACH = 700;
/** Animated elements this far outside the viewport keep the frame loop running. */
const ANIMATION_MARGIN = 600;
/** Rows outside the viewport (CSS px) kept current while things move. */
const SCISSOR_PAD = 80;
/** After motion stops, refresh the rest of the band this many ms later. */
const SETTLE_MS = 150;

const OBSERVED_ATTRIBUTES = [
  'style',
  'class',
  'hidden',
  'open',
  'data-box',
  'data-light',
  'data-material',
  'data-opacity',
  'data-shine',
  'data-glow',
  'data-flicker',
  'data-bloom',
  'data-reach',
];
const STRUCTURAL_ATTRIBUTES = new Set(['data-box', 'data-light']);

const UNIFORMS = [
  'uBoxes',
  'uBoxCount',
  'uLightCount',
  'uLP',
  'uLC',
  'uLS',
  'uLM',
  'uAmbient',
  'uRes',
  'uScale',
] as const;

export class DomLamps {
  /** The light map, composited with `mix-blend-mode: multiply`. */
  readonly canvas: HTMLCanvasElement;
  /** Light glows, composited with `mix-blend-mode: screen`. */
  readonly bloomCanvas: HTMLCanvasElement;

  private gl: WebGL2RenderingContext | null = null;
  private bloom: CanvasRenderingContext2D | null = null;
  private program: WebGLProgram | null = null;
  private boxTex: WebGLTexture | null = null;
  private loc = {} as Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;
  private maxTextureSize = 4096;

  private boxData = new Float32Array(MAX_BOXES * 4 * 3);
  private lightBuf: LightBuffers = createLightBuffers(MAX_LIGHTS);
  private boxCount = 0;
  private lightCount = 0;
  private lightRecords: LightRecord[] = [];

  private boxes: HTMLElement[] = [];
  private lights: HTMLElement[] = [];
  private animating = new Set<Element>();

  private _scale: number;
  private readonly bandFactor: number;
  private readonly root: HTMLElement;
  private readonly disableQuery: MediaQueryList | null;
  private readonly reducedMotion: MediaQueryList;
  private readonly shouldRegister: boolean;
  private band: Band = EMPTY_BAND;

  private raf = 0;
  private dirty = true;
  private needFull = true;
  private staleOutside = false;
  private idleTimer = 0;
  private cleanup: (() => void)[] = [];
  private state: 'idle' | 'running' | 'lost' | 'destroyed' = 'idle';
  private userEnabled = true;
  private warned = new Set<string>();

  constructor(options: DomLampsOptions = {}) {
    this._scale = clamp(options.scale ?? 0.5, 0.2, 1);
    this.bandFactor = Math.max(1, options.band ?? 3);
    this.root = options.root ?? document.body;
    this.shouldRegister = options.registerProperties ?? true;
    const query = options.disableWhen ?? DEFAULT_DISABLE_QUERY;
    this.disableQuery = query ? matchMedia(query) : null;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.canvas = document.createElement('canvas');
    this.bloomCanvas = document.createElement('canvas');
  }

  /** Light-map resolution, canvas px per CSS px. */
  get scale(): number {
    return this._scale;
  }

  /** True while the overlay is shown: started, not switched off by the user or by `disableWhen`. */
  get active(): boolean {
    return this.state === 'running' && this.userEnabled && !this.disableQuery?.matches;
  }

  /**
   * Mounts the canvases and starts rendering. Returns false, leaving the page untouched and fully
   * lit, when WebGL2 is unavailable or the shader fails to compile.
   */
  start(): boolean {
    if (this.state !== 'idle') return this.state === 'running';
    this.gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
    });
    if (!this.gl || !this.initGL()) {
      this.gl = null;
      return false;
    }
    this.bloom = this.bloomCanvas.getContext('2d');
    if (this.shouldRegister) registerProperties();

    styleCanvas(this.canvas, 'domlamps-map', 'multiply', 0);
    styleCanvas(this.bloomCanvas, 'domlamps-bloom', 'screen', 1);
    this.root.append(this.canvas, this.bloomCanvas);
    this.state = 'running';

    this.collect();
    this.listen();
    this.applyVisibility();
    this.layoutBand(true);
    document.fonts?.ready.then(() => this.invalidate(true));
    return true;
  }

  /** Stops rendering, removes listeners and canvases, and releases the WebGL context. */
  destroy(): void {
    if (this.state === 'destroyed') return;
    this.state = 'destroyed';
    cancelAnimationFrame(this.raf);
    clearTimeout(this.idleTimer);
    for (const fn of this.cleanup) fn();
    this.cleanup = [];
    this.animating.clear();
    this.canvas.remove();
    this.bloomCanvas.remove();
    document.documentElement.classList.remove('domlamps-on');
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
  }

  /** Requests a re-render on the next frame. `full` re-renders the whole band, not just the viewport. */
  invalidate(full = false): void {
    this.dirty = true;
    if (full) this.needFull = true;
    this.schedule();
  }

  /** Synchronously renders the whole band. Rarely needed: the engine renders on demand by itself. */
  render(): void {
    if (!this.active) return;
    this.renderFrame(performance.now(), true);
  }

  /** Changes the light-map resolution (clamped to 0.2–1). */
  setScale(scale: number): void {
    this._scale = clamp(scale, 0.2, 1);
    if (this.state === 'running') this.layoutBand(true);
  }

  /** Shows or hides the overlay without tearing the engine down (e.g. a "lights on" toggle). */
  setEnabled(enabled: boolean): void {
    this.userEnabled = enabled;
    this.applyVisibility();
  }

  // ---------------------------------------------------------------- setup

  private initGL(): boolean {
    const gl = this.gl;
    if (!gl) return false;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (!s) throw new Error('createShader failed');
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader error');
      return s;
    };
    try {
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link error');
      this.program = p;
    } catch (err) {
      console.warn('[domlamps] disabled:', err);
      return false;
    }
    gl.useProgram(this.program);
    for (const n of UNIFORMS) this.loc[n] = gl.getUniformLocation(this.program, n);
    this.boxTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.boxTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, MAX_BOXES, 3, 0, gl.RGBA, gl.FLOAT, null);
    gl.uniform1i(this.loc.uBoxes, 0);
    gl.bindVertexArray(gl.createVertexArray());
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    return true;
  }

  private collect(): void {
    this.boxes = [...document.querySelectorAll<HTMLElement>('[data-box]')];
    this.lights = [...document.querySelectorAll<HTMLElement>('[data-light]')];
  }

  private listen(): void {
    const on = (target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn, opts);
      this.cleanup.push(() => target.removeEventListener(type, fn, opts));
    };

    // Transitions and animations anywhere may move or re-style boxes and lights: render while they run.
    const animationStarted = (e: Event) => {
      if (e.target instanceof Element) this.animating.add(e.target);
      this.schedule();
    };
    on(document, 'transitionrun', animationStarted);
    on(document, 'animationstart', animationStarted);

    // Native scroll moves the canvas with the content, so scrolling is free until we near the band edge.
    on(
      window,
      'scroll',
      () => {
        if (this.layoutBand(false) || this.staleOutside) this.invalidate(true);
      },
      { passive: true },
    );
    on(window, 'resize', () => this.layoutBand(true));
    on(document, INVALIDATE_EVENT, () => this.invalidate(true));

    on(this.canvas, 'webglcontextlost', (e) => {
      e.preventDefault();
      if (this.state !== 'running') return;
      this.state = 'lost';
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    });
    on(this.canvas, 'webglcontextrestored', () => {
      if (this.state !== 'lost') return;
      if (!this.initGL()) return this.destroy();
      this.state = 'running';
      this.invalidate(true);
    });

    const visibility = () => this.applyVisibility();
    this.disableQuery?.addEventListener('change', visibility);
    this.cleanup.push(() => this.disableQuery?.removeEventListener('change', visibility));

    const ro = new ResizeObserver(() => this.layoutBand(true));
    ro.observe(document.documentElement);
    this.cleanup.push(() => ro.disconnect());

    const own = new Set<Node>([this.canvas, this.bloomCanvas]);
    const mo = new MutationObserver((records) => {
      let relevant = false;
      let structural = false;
      for (const r of records) {
        if (own.has(r.target)) continue; // our own canvas styling
        relevant = true;
        if (r.type === 'childList' || STRUCTURAL_ATTRIBUTES.has(r.attributeName ?? '')) structural = true;
      }
      if (structural) this.collect();
      if (relevant) this.invalidate();
    });
    mo.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: OBSERVED_ATTRIBUTES,
    });
    this.cleanup.push(() => mo.disconnect());
  }

  private applyVisibility(): void {
    if (this.state === 'destroyed' || this.state === 'idle') return;
    const on = this.active;
    this.canvas.hidden = !on;
    this.bloomCanvas.hidden = !on;
    document.documentElement.classList.toggle('domlamps-on', on);
    if (on) this.invalidate(true);
  }

  /** Sizes and positions the canvas band around the viewport. Returns true if it moved. */
  private layoutBand(force: boolean): boolean {
    if (this.state !== 'running') return false;
    const doc = document.documentElement;
    const input = {
      scrollY,
      viewportHeight: innerHeight,
      documentHeight: doc.scrollHeight,
      documentWidth: doc.clientWidth,
      factor: this.bandFactor,
      scale: this._scale,
      maxTextureSize: this.maxTextureSize,
    };
    if (!force && bandIsCurrent(this.band, input)) return false;

    this.band = computeBand(input);
    const { top, height, width } = this.band;
    const w = Math.max(1, Math.min(this.maxTextureSize, Math.round(width * this._scale)));
    const h = Math.max(1, Math.round(height * this._scale));
    for (const c of [this.canvas, this.bloomCanvas]) {
      if (c.width !== w) c.width = w;
      if (c.height !== h) c.height = h;
      Object.assign(c.style, { top: `${top}px`, width: `${width}px`, height: `${height}px` });
    }
    this.invalidate(true);
    return true;
  }

  // ---------------------------------------------------------------- frame loop

  private schedule(): void {
    if (!this.raf && this.active) this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (time: number): void => {
    this.raf = 0;
    if (!this.active) return;
    const continuous = this.isContinuous();
    if (this.needFull || this.dirty || continuous) this.renderFrame(time, this.needFull);
    if (continuous) this.schedule();
    else if (this.staleOutside) {
      // Settle: once motion stops, refresh the off-screen parts of the band.
      clearTimeout(this.idleTimer);
      this.idleTimer = window.setTimeout(() => this.invalidate(true), SETTLE_MS);
    }
  };

  private renderFrame(time: number, full: boolean): void {
    this.sync(time);
    this.draw(full);
    this.drawBloom();
    this.dirty = false;
    this.needFull = false;
    this.staleOutside = !full;
  }

  private isContinuous(): boolean {
    const near = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.bottom > -ANIMATION_MARGIN && r.top < innerHeight + ANIMATION_MARGIN;
    };
    for (const el of this.animating) {
      if (!el.isConnected || !el.getAnimations().length) this.animating.delete(el);
    }
    for (const el of this.animating) if (near(el)) return true;
    if (!this.reducedMotion.matches) for (const el of this.lights) if (el.dataset.flicker && near(el)) return true;
    return false;
  }

  // ---------------------------------------------------------------- DOM -> scene

  private sample(el: HTMLElement): ElementSample {
    return { rect: el.getBoundingClientRect(), style: getComputedStyle(el), dataset: el.dataset };
  }

  private sync(time: number): void {
    const origin = { x: scrollX, y: scrollY - this.band.top }; // viewport -> band coordinates
    const owners = new Map<Element, BoxRecord & { index: number }>();
    let n = 0;
    for (const el of this.boxes) {
      if (n >= MAX_BOXES) {
        this.warnOnce('boxes', `more than ${MAX_BOXES} boxes near the viewport; extra boxes are ignored`);
        break;
      }
      const box = readBox(this.sample(el), origin, linearColor);
      if (!box || !boxNearBand(box, this.band.height, BOX_REACH)) continue;
      writeBox(this.boxData, n, MAX_BOXES, box);
      owners.set(el, { ...box, index: n });
      n++;
    }
    this.boxCount = n;

    let m = 0;
    this.lightRecords = [];
    const flicker = !this.reducedMotion.matches;
    for (const el of this.lights) {
      if (m >= MAX_LIGHTS) {
        this.warnOnce('lights', `more than ${MAX_LIGHTS} lights near the viewport; extra lights are ignored`);
        break;
      }
      const ownerEl = el.parentElement?.closest<HTMLElement>('[data-box]');
      const owner = ownerEl ? owners.get(ownerEl) : undefined;
      const light = readLight(this.sample(el), {
        origin,
        owner: owner
          ? { z: owner.z, index: owner.index }
          : ownerEl
            ? { z: Number.parseFloat(getComputedStyle(ownerEl).getPropertyValue('--lamp-z')) || 0, index: -1 }
            : null,
        time: time / 1000,
        flicker,
        seed: m,
        color: linearColor,
      });
      if (!light || !lightReachesBand(light, this.band.height)) continue;
      writeLight(this.lightBuf, m, light);
      this.lightRecords.push(light);
      m++;
    }
    this.lightCount = m;
  }

  private draw(full: boolean): void {
    const gl = this.gl;
    if (!gl) return;
    const { width: w, height: h } = this.canvas;
    gl.viewport(0, 0, w, h);

    if (full) gl.disable(gl.SCISSOR_TEST);
    else {
      // Only the viewport (plus a margin) needs to be current while things move.
      const y0 = Math.max(0, Math.floor((scrollY - this.band.top - SCISSOR_PAD) * this._scale));
      const y1 = Math.min(h, Math.ceil((scrollY + innerHeight - this.band.top + SCISSOR_PAD) * this._scale));
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, h - y1, w, Math.max(0, y1 - y0));
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.boxTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, MAX_BOXES, 3, gl.RGBA, gl.FLOAT, this.boxData);

    const ambient = linearColor(
      getComputedStyle(document.documentElement).getPropertyValue('--domlamps-ambient'),
      [0.02, 0.02, 0.03],
    );
    gl.uniform1i(this.loc.uBoxCount, this.boxCount);
    gl.uniform1i(this.loc.uLightCount, this.lightCount);
    gl.uniform4fv(this.loc.uLP, this.lightBuf.position);
    gl.uniform4fv(this.loc.uLC, this.lightBuf.color);
    gl.uniform4fv(this.loc.uLS, this.lightBuf.shape);
    gl.uniform4fv(this.loc.uLM, this.lightBuf.meta);
    gl.uniform3fv(this.loc.uAmbient, ambient);
    gl.uniform2f(this.loc.uRes, w, h);
    gl.uniform1f(this.loc.uScale, this._scale);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Glow can only brighten, which multiply cannot do: a second canvas with mix-blend-mode: screen. */
  private drawBloom(): void {
    const ctx = this.bloom;
    if (!ctx) return;
    const s = this._scale;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, this.bloomCanvas.width, this.bloomCanvas.height);
    ctx.globalCompositeOperation = 'lighter';
    for (const l of this.lightRecords) {
      if (!l.bloom) continue;
      const size = (22 + 34 * Math.min(l.intensity, 2)) * l.bloom * s;
      const [r, g, b] = l.color.map((c) => Math.round(linearToSrgb(c) * 255));
      const a = Math.min(0.85, 0.45 * l.intensity);
      const x = l.x * s;
      const y = l.y * s;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, size);
      grad.addColorStop(0, `rgb(${r} ${g} ${b} / ${a})`);
      grad.addColorStop(0.35, `rgb(${r} ${g} ${b} / ${a * 0.35})`);
      grad.addColorStop(1, `rgb(${r} ${g} ${b} / 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(x - size, y - size, size * 2, size * 2);
    }
  }

  private warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(`[domlamps] ${message}`);
  }
}

function styleCanvas(c: HTMLCanvasElement, className: string, blend: string, layerOffset: number): void {
  c.className = className;
  c.setAttribute('aria-hidden', 'true');
  Object.assign(c.style, {
    position: 'absolute',
    left: '0',
    pointerEvents: 'none',
    mixBlendMode: blend,
    zIndex: `calc(var(--domlamps-layer, 50) + ${layerOffset})`,
  });
}
