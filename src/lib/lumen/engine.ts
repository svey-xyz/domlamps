import { FRAG, MAX_BOXES, MAX_LIGHTS, VERT } from './shader';
import { linearColor, type RGB } from './color';

/**
 * Lumen — 2.5D lighting for real DOM.
 *
 * The DOM is the scene: [data-box] elements are extruded boxes of height --z,
 * [data-light] elements are lights. A WebGL2 fragment shader renders a light map
 * into a canvas that is multiplied over the page. Layout, scrolling, text,
 * selection and events all stay native.
 */

export interface LumenOptions {
  /** Light-map resolution in canvas px per CSS px (0.25–1). Light is low-frequency; 0.5 is plenty. */
  scale?: number;
  /** Canvas band height as a multiple of the viewport, so native scrolling needs no re-render. */
  band?: number;
  /** Where the canvases are inserted. */
  root?: HTMLElement;
}

type MaterialName = 'solid' | 'glass' | 'paper' | 'emissive' | 'metal';

const MATERIALS: Record<MaterialName, { id: number; opacity: number; shine: number; tint: RGB }> = {
  solid: { id: 0, opacity: 1, shine: 0, tint: [1, 1, 1] },
  glass: { id: 1, opacity: 0.3, shine: 0.35, tint: [1, 1, 1] },
  paper: { id: 2, opacity: 0.6, shine: 0, tint: [1, 0.93, 0.8] },
  emissive: { id: 3, opacity: 0, shine: 0, tint: [1, 1, 1] },
  metal: { id: 4, opacity: 1, shine: 0.8, tint: [1, 1, 1] },
};

const LIGHT_TYPES = { point: 0, spot: 1, sun: 2 } as const;
const DEG = Math.PI / 180;

interface LightState {
  el: HTMLElement;
  x: number;
  y: number;
  color: RGB;
  intensity: number;
  radius: number;
  bloom: number;
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Lumen {
  readonly canvas = document.createElement('canvas');
  readonly bloomCanvas = document.createElement('canvas');

  private gl: WebGL2RenderingContext | null;
  private bloom: CanvasRenderingContext2D | null;
  private program!: WebGLProgram;
  private boxTex!: WebGLTexture;
  private loc: Record<string, WebGLUniformLocation | null> = {};

  private boxData = new Float32Array(MAX_BOXES * 4 * 3);
  private lp = new Float32Array(MAX_LIGHTS * 4);
  private lc = new Float32Array(MAX_LIGHTS * 4);
  private ls = new Float32Array(MAX_LIGHTS * 4);
  private lm = new Float32Array(MAX_LIGHTS * 4);
  private boxCount = 0;
  private lightCount = 0;
  private lightStates: LightState[] = [];

  private boxes: HTMLElement[] = [];
  private lights: HTMLElement[] = [];
  private animating = new Set<Element>();

  private scale: number;
  private bandFactor: number;
  private root: HTMLElement;
  private width = 0;
  private bandTop = 0;
  private bandH = 0;

  private raf = 0;
  private dirty = true;
  private needFull = true;
  private staleOutside = false;
  private idleTimer = 0;
  private cleanup: (() => void)[] = [];

  constructor(opts: LumenOptions = {}) {
    this.scale = opts.scale ?? 0.5;
    this.bandFactor = opts.band ?? 3;
    this.root = opts.root ?? document.body;
    this.gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true, premultipliedAlpha: false });
    this.bloom = this.bloomCanvas.getContext('2d');
  }

  /** Returns false (and leaves the page untouched, fully lit) when WebGL2 is unavailable. */
  start(): boolean {
    if (!this.gl || !this.initGL()) return false;
    this.canvas.className = 'lumen-map';
    this.bloomCanvas.className = 'lumen-bloom';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.bloomCanvas.setAttribute('aria-hidden', 'true');
    this.root.append(this.canvas, this.bloomCanvas);
    document.documentElement.classList.add('lumen-on');

    this.collect();
    this.layoutBand(true);
    this.listen();
    document.fonts?.ready.then(() => this.invalidate(true));
    this.schedule();
    return true;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.idleTimer);
    this.cleanup.forEach((fn) => fn());
    this.canvas.remove();
    this.bloomCanvas.remove();
    document.documentElement.classList.remove('lumen-on');
  }

  /** Request a re-render. `full` re-renders the whole band, not just the viewport. */
  invalidate(full = false) {
    this.dirty = true;
    if (full) this.needFull = true;
    this.schedule();
  }

  setScale(scale: number) {
    this.scale = Math.min(1, Math.max(0.2, scale));
    this.layoutBand(true);
  }

  // ---------------------------------------------------------------- setup

  private initGL(): boolean {
    const gl = this.gl!;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader error');
      return s;
    };
    try {
      const p = gl.createProgram()!;
      gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link error');
      this.program = p;
    } catch (err) {
      console.warn('[lumen] disabled:', err);
      return false;
    }
    gl.useProgram(this.program);
    for (const n of ['uBoxes', 'uBoxCount', 'uLightCount', 'uLP', 'uLC', 'uLS', 'uLM', 'uAmbient', 'uRes', 'uScale']) {
      this.loc[n] = gl.getUniformLocation(this.program, n);
    }
    this.boxTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.boxTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, MAX_BOXES, 3, 0, gl.RGBA, gl.FLOAT, null);
    gl.uniform1i(this.loc.uBoxes, 0);
    gl.bindVertexArray(gl.createVertexArray());
    return true;
  }

  private collect() {
    this.boxes = [...document.querySelectorAll<HTMLElement>('[data-box]')];
    this.lights = [...document.querySelectorAll<HTMLElement>('[data-light]')];
  }

  private listen() {
    const on = <K extends keyof DocumentEventMap>(target: EventTarget, type: K | string, fn: (e: any) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn, opts);
      this.cleanup.push(() => target.removeEventListener(type, fn, opts));
    };

    // Transitions / animations anywhere may move or re-style boxes and lights: render while they run.
    const start = (e: Event) => {
      this.animating.add(e.target as Element);
      this.schedule();
    };
    on(document, 'transitionrun', start);
    on(document, 'animationstart', start);

    // Native scroll moves the canvas with the content, so scrolling is free until we near the band edge.
    on(window, 'scroll', () => {
      if (this.layoutBand(false) || this.staleOutside) this.invalidate(true);
    }, { passive: true });
    on(window, 'resize', () => this.layoutBand(true));
    on(document, 'lumen:invalidate', () => this.invalidate(true));

    const ro = new ResizeObserver(() => this.layoutBand(true));
    ro.observe(document.documentElement);
    this.cleanup.push(() => ro.disconnect());

    const mo = new MutationObserver((records) => {
      if (records.some((r) => r.type === 'childList' || r.attributeName?.startsWith('data-box') || r.attributeName === 'data-light')) this.collect();
      this.invalidate();
    });
    mo.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden', 'open', 'data-box', 'data-light', 'data-material', 'data-opacity', 'data-soft', 'data-shine'],
    });
    this.cleanup.push(() => mo.disconnect());
  }

  /** Size/position the canvas band around the viewport. Returns true if it moved. */
  private layoutBand(force: boolean): boolean {
    const gl = this.gl!;
    const vh = innerHeight;
    const docH = document.documentElement.scrollHeight;
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const bandH = Math.min(docH, Math.round(vh * this.bandFactor), Math.floor(maxTex / this.scale));
    const width = document.documentElement.clientWidth;
    const y = scrollY;
    const edge = vh * 0.5;
    const inside = y >= this.bandTop + (this.bandTop > 0 ? edge : 0) - 1 && y + vh <= this.bandTop + this.bandH - (this.bandTop + this.bandH < docH ? edge : 0) + 1;
    if (!force && inside && bandH === this.bandH && width === this.width) return false;

    this.bandH = bandH;
    this.width = width;
    this.bandTop = Math.max(0, Math.min(docH - bandH, Math.round(y - (bandH - vh) / 2)));
    const w = Math.max(1, Math.round(width * this.scale));
    const h = Math.max(1, Math.round(bandH * this.scale));
    for (const c of [this.canvas, this.bloomCanvas]) {
      if (c.width !== w) c.width = w;
      if (c.height !== h) c.height = h;
      Object.assign(c.style, { top: `${this.bandTop}px`, width: `${width}px`, height: `${bandH}px` });
    }
    this.invalidate(true);
    return true;
  }

  // ---------------------------------------------------------------- frame loop

  private schedule() {
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (time: number) => {
    this.raf = 0;
    const continuous = this.isContinuous();
    if (this.needFull || this.dirty || continuous) {
      const full = this.needFull;
      this.sync(time);
      this.draw(full);
      this.drawBloom();
      this.dirty = false;
      this.needFull = false;
      this.staleOutside = !full;
    }
    if (continuous) this.schedule();
    else if (this.staleOutside) {
      // Settle: once motion stops, refresh the off-screen parts of the band.
      clearTimeout(this.idleTimer);
      this.idleTimer = window.setTimeout(() => this.invalidate(true), 150);
    }
  };

  private isContinuous(): boolean {
    const margin = 600;
    const near = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.bottom > -margin && r.top < innerHeight + margin;
    };
    for (const el of this.animating) {
      if (!el.isConnected || !el.getAnimations().length) this.animating.delete(el);
    }
    for (const el of this.animating) if (near(el)) return true;
    if (!reducedMotion()) for (const el of this.lights) if (el.dataset.flicker && near(el)) return true;
    return false;
  }

  // ---------------------------------------------------------------- DOM -> scene

  private sync(time: number) {
    const sx = scrollX;
    const oy = scrollY - this.bandTop; // viewport y -> band y
    const bandH = this.bandH;
    const reach = 700; // boxes this far outside the band can still shadow into it
    const d = this.boxData;
    const owners = new Map<Element, number>();
    let n = 0;

    for (const el of this.boxes) {
      if (n >= MAX_BOXES) break;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cy = r.top + r.height / 2 + oy;
      if (cy + r.height / 2 < -reach || cy - r.height / 2 > bandH + reach) continue;
      const cs = getComputedStyle(el);
      const mat = MATERIALS[(el.dataset.material as MaterialName) ?? 'solid'] ?? MATERIALS.solid;
      const z = num(cs, '--z', 0);
      const tint = linearColor(cs.getPropertyValue('--tint'), mat.tint);
      const opacity = numAttr(el.dataset.opacity, mat.opacity);
      const radius = cornerRadius(cs.borderTopLeftRadius, r.width, r.height);

      d.set([r.left + r.width / 2 + sx, cy, r.width / 2, r.height / 2], n * 4);
      d.set([z, radius, mat.id, numAttr(el.dataset.shine, mat.shine)], (MAX_BOXES + n) * 4);
      const k = mat.id === MATERIALS.emissive.id ? numAttr(el.dataset.glow, 1) : 1 - opacity;
      d.set([tint[0] * k, tint[1] * k, tint[2] * k, 0], (2 * MAX_BOXES + n) * 4);
      owners.set(el, n);
      n++;
    }
    this.boxCount = n;

    const flickerOn = !reducedMotion();
    let m = 0;
    this.lightStates = [];
    for (const el of this.lights) {
      if (m >= MAX_LIGHTS) break;
      const cs = getComputedStyle(el);
      let intensity = num(cs, '--intensity', 1);
      const flicker = numAttr(el.dataset.flicker, 0);
      if (flicker && flickerOn) intensity *= 1 - flicker * noise(time / 1000 + m * 17.3);
      if (intensity <= 0.001) continue;

      const type = (el.dataset.light as keyof typeof LIGHT_TYPES) in LIGHT_TYPES ? (el.dataset.light as keyof typeof LIGHT_TYPES) : 'point';
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2 + sx;
      const y = r.top + r.height / 2 + oy;
      const radius = num(cs, '--radius', 400);
      if (type !== 'sun' && (y + radius < 0 || y - radius > bandH)) continue;

      const ownerEl = el.parentElement?.closest<HTMLElement>('[data-box]') ?? null;
      const ownerZ = ownerEl ? num(getComputedStyle(ownerEl), '--z', 0) : 0;
      const z = ownerZ + num(cs, '--lz', 80);
      const color = linearColor(cs.getPropertyValue('--light-color'));
      const dir = num(cs, '--dir', 90) * DEG;
      const cone = num(cs, '--cone', 50) * DEG;
      const soft = numAttr(el.dataset.soft, 10);
      const o = m * 4;

      if (type === 'sun') {
        // --dir is the direction light travels; the shader wants the direction toward the sun.
        this.lp.set([x, y, z, numAttr(el.dataset.reach, 1400)], o);
        this.ls.set([-Math.cos(dir), -Math.sin(dir), 0, 0], o);
      } else {
        this.lp.set([x, y, z, radius], o);
        this.ls.set([Math.cos(dir), Math.sin(dir), Math.cos(cone / 2), Math.cos((cone / 2) * 0.6)], o);
      }
      this.lc.set([color[0], color[1], color[2], intensity], o);
      this.lm.set([LIGHT_TYPES[type], soft, ownerEl ? (owners.get(ownerEl) ?? -1) : -1, num(cs, '--elevation', 45) * DEG], o);
      this.lightStates.push({ el, x, y, color, intensity, radius, bloom: numAttr(el.dataset.bloom, type === 'sun' ? 0 : 1) });
      m++;
    }
    this.lightCount = m;
  }

  private draw(full: boolean) {
    const gl = this.gl!;
    const { width: w, height: h } = this.canvas;
    gl.viewport(0, 0, w, h);

    if (full) gl.disable(gl.SCISSOR_TEST);
    else {
      // Only the viewport (plus a margin) needs to be current while things move.
      const pad = 80;
      const y0 = Math.max(0, Math.floor((scrollY - this.bandTop - pad) * this.scale));
      const y1 = Math.min(h, Math.ceil((scrollY + innerHeight - this.bandTop + pad) * this.scale));
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, h - y1, w, Math.max(0, y1 - y0));
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.boxTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, MAX_BOXES, 3, gl.RGBA, gl.FLOAT, this.boxData);

    const ambient = linearColor(getComputedStyle(document.documentElement).getPropertyValue('--lumen-ambient'), [0.02, 0.02, 0.03]);
    gl.uniform1i(this.loc.uBoxCount, this.boxCount);
    gl.uniform1i(this.loc.uLightCount, this.lightCount);
    gl.uniform4fv(this.loc.uLP, this.lp);
    gl.uniform4fv(this.loc.uLC, this.lc);
    gl.uniform4fv(this.loc.uLS, this.ls);
    gl.uniform4fv(this.loc.uLM, this.lm);
    gl.uniform3fv(this.loc.uAmbient, ambient);
    gl.uniform2f(this.loc.uRes, w, h);
    gl.uniform1f(this.loc.uScale, this.scale);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Glow can only brighten, which multiply cannot do: a second canvas with mix-blend-mode: screen. */
  private drawBloom() {
    const ctx = this.bloom;
    if (!ctx) return;
    const s = this.scale;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, this.bloomCanvas.width, this.bloomCanvas.height);
    ctx.globalCompositeOperation = 'lighter';
    for (const l of this.lightStates) {
      if (!l.bloom) continue;
      const size = (22 + 34 * Math.min(l.intensity, 2)) * l.bloom * s;
      const [r, g, b] = l.color.map((c) => Math.round(Math.min(1, c) ** (1 / 2.2) * 255));
      const a = Math.min(0.85, 0.45 * l.intensity);
      const grad = ctx.createRadialGradient(l.x * s, l.y * s, 0, l.x * s, l.y * s, size);
      grad.addColorStop(0, `rgb(${r} ${g} ${b} / ${a})`);
      grad.addColorStop(0.35, `rgb(${r} ${g} ${b} / ${a * 0.35})`);
      grad.addColorStop(1, `rgb(${r} ${g} ${b} / 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(l.x * s - size, l.y * s - size, size * 2, size * 2);
    }
  }
}

// ---------------------------------------------------------------- helpers

function num(cs: CSSStyleDeclaration, prop: string, fallback: number) {
  const v = parseFloat(cs.getPropertyValue(prop));
  return Number.isFinite(v) ? v : fallback;
}

function numAttr(v: string | undefined, fallback: number) {
  const n = v === undefined || v === '' ? NaN : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function cornerRadius(value: string, w: number, h: number) {
  const v = parseFloat(value) || 0;
  const px = value.trim().endsWith('%') ? (v / 100) * Math.min(w, h) : v;
  return Math.min(px, w / 2, h / 2);
}

/** Smooth 0–1 value noise from a few incommensurate sines (candle flicker). */
function noise(t: number) {
  const v = Math.sin(t * 7.3) * 0.5 + Math.sin(t * 13.1 + 1.7) * 0.3 + Math.sin(t * 29.7 + 4.1) * 0.2;
  return (v + 1) / 2;
}
