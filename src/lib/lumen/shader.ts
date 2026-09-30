/**
 * Light-map shader. One fullscreen triangle; every fragment is a point on the
 * top-down "floor" of the page, in CSS pixels relative to the canvas band.
 *
 * Scene model
 *  - Boxes: axis-aligned rounded rects extruded from z = 0 to z = h (a DOM element with data-box).
 *  - Lights: point / spot / sun with a 3D position (x, y from layout, z from CSS --z / --lz).
 *
 * Output is a multiplier in sRGB: 1 = content untouched, 0 = black. The canvas is
 * composited over the page with mix-blend-mode: multiply.
 */

export const MAX_BOXES = 128;
export const MAX_LIGHTS = 8;

export const VERT = /* glsl */ `#version 300 es
void main() {
  // Fullscreen triangle, no buffers needed.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

#define MAX_LIGHTS ${MAX_LIGHTS}
#define MAT_EMISSIVE 3

// Box data texture: MAX_BOXES x 3, RGBA32F, read with texelFetch.
//  row 0: cx, cy, halfW, halfH          (CSS px, canvas space)
//  row 1: z (height), cornerRadius, material, shine
//  row 2: transmit rgb (shadow tint; emissive colour for emissive boxes), unused
uniform sampler2D uBoxes;
uniform int uBoxCount;

uniform int  uLightCount;
uniform vec4 uLP[MAX_LIGHTS];  // x, y, z, radius (sun: max shadow length)
uniform vec4 uLC[MAX_LIGHTS];  // linear r, g, b, intensity
uniform vec4 uLS[MAX_LIGHTS];  // dir.x, dir.y, cosOuter, cosInner
uniform vec4 uLM[MAX_LIGHTS];  // type (0 point, 1 spot, 2 sun), softness k, owner box index (-1 none), sun elevation (rad)

uniform vec3  uAmbient;  // linear
uniform vec2  uRes;      // canvas size in device px of the light map
uniform float uScale;    // light-map px per CSS px

out vec4 outColor;

vec4 B0(int i) { return texelFetch(uBoxes, ivec2(i, 0), 0); }
vec4 B1(int i) { return texelFetch(uBoxes, ivec2(i, 1), 0); }
vec4 B2(int i) { return texelFetch(uBoxes, ivec2(i, 2), 0); }

// 2D rounded-rect SDF.
float sdRect(vec2 p, vec4 b, float r) {
  vec2 q = abs(p - b.xy) - b.zw + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// Rounded rect extruded from z = 0 to z = h.
float sdBox(vec3 p, vec4 b, float h, float r) {
  float d = sdRect(p.xy, b, r);
  float dz = abs(p.z - h * 0.5) - h * 0.5;
  vec2 w = vec2(d, dz);
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0));
}

// Soft shadow from ONE box: sphere-trace the ray against that box only.
// 0 = fully blocked, 1 = unblocked; k controls penumbra hardness.
float boxShadow(vec3 ro, vec3 rd, float tMax, vec4 b0, vec4 b1, float k) {
  float res = 1.0;
  float t = 1.0;
  for (int s = 0; s < 40; s++) {
    if (t >= tMax) break;
    float h = sdBox(ro + rd * t, b0, b1.x, b1.y);
    if (h < 0.05) return 0.0;
    res = min(res, k * h / t);
    t += max(h, 1.5);
  }
  res = clamp(res, 0.0, 1.0);
  return res * res * (3.0 - 2.0 * res);
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uScale;

  // 1. Receiver: the tallest box whose footprint contains p (the floor is z = 0).
  float hp = 0.0;
  int rid = -1;
  for (int i = 0; i < uBoxCount; i++) {
    vec4 b0 = B0(i), b1 = B1(i);
    if (b1.x >= hp && sdRect(p, b0, b1.y) < 0.0) { hp = b1.x; rid = i; }
  }

  // 2. Contact / ambient occlusion from boxes taller than the receiver.
  float ao = 1.0;
  for (int i = 0; i < uBoxCount; i++) {
    if (i == rid) continue;
    vec4 b1 = B1(i);
    if (b1.x <= hp || int(b1.z) == MAT_EMISSIVE) continue;
    float d = sdRect(p, B0(i), b1.y);
    if (d < 0.0) continue;
    float spread = clamp((b1.x - hp) * 0.3, 2.0, 26.0);
    ao *= 1.0 - 0.42 * exp(-d / spread);
  }

  vec4 rb1 = rid >= 0 ? B1(rid) : vec4(0.0);
  float shine = rb1.w;
  vec3 P = vec3(p, hp + 0.5);
  vec3 sum = vec3(0.0);

  for (int l = 0; l < uLightCount; l++) {
    vec4 lp = uLP[l], lc = uLC[l], ls = uLS[l], lm = uLM[l];
    int type = int(lm.x);
    int owner = int(lm.z);
    vec3 L;
    float tMax, att;

    // Lantern: light sits inside its owner box, below the owner's top.
    // The top is not lit directly; light leaks through the owner's material instead.
    if (rid >= 0 && rid == owner && lp.z < hp) {
      vec4 ob0 = B0(rid);
      float g = 1.0 - 0.75 * smoothstep(0.0, max(ob0.z, ob0.w) * 1.2, length(P.xy - lp.xy));
      sum += lc.rgb * lc.a * B2(rid).rgb * g;
      continue;
    }

    if (type == 2) {
      float el = lm.w;
      L = vec3(ls.xy * cos(el), sin(el));
      tMax = lp.w;
      att = 1.0;
    } else {
      vec3 d = lp.xyz - P;
      float dist = length(d);
      if (dist >= lp.w) continue;
      L = d / dist;
      tMax = dist - 1.0;
      float f = 1.0 - dist / lp.w;
      att = f * f;
      if (type == 1) {
        vec2 toP = P.xy - lp.xy;
        float c = dot(toP / max(length(toP), 1e-3), ls.xy);
        att *= smoothstep(ls.z, ls.w, c);
      }
    }

    // Surface normal of every top (and the floor) is +z, so N·L = L.z.
    // A light at or below the receiver's height cannot light it.
    float ndl = L.z;
    if (ndl <= 0.0 || att <= 0.0) continue;
    ndl = (ndl + 0.2) / 1.2; // slight wrap so grazing light still reads

    // Shadows: product of per-box transmissions (solid = 0, glass = tinted, paper = partial).
    vec3 T = vec3(1.0);
    vec3 end = P + L * tMax;
    vec2 lo = min(P.xy, end.xy), hi = max(P.xy, end.xy);
    float k = lm.y;
    float margin = 4.0 + tMax / k;
    for (int i = 0; i < uBoxCount; i++) {
      if (i == rid || i == owner) continue;
      vec4 b1 = B1(i);
      if (b1.x <= hp || int(b1.z) == MAT_EMISSIVE) continue; // too low to block a rising ray
      vec4 b0 = B0(i);
      if (b0.x + b0.z + margin < lo.x || b0.x - b0.z - margin > hi.x ||
          b0.y + b0.w + margin < lo.y || b0.y - b0.w - margin > hi.y) continue;
      float s = boxShadow(P, L, tMax, b0, b1, k);
      T *= mix(B2(i).rgb, vec3(1.0), s);
      if (max(T.r, max(T.g, T.b)) < 0.002) break;
    }

    vec3 c = lc.rgb * lc.a * att * T;
    sum += c * ndl;
    if (shine > 0.0) {
      vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
      sum += c * pow(max(H.z, 0.0), 48.0) * shine * 2.0;
    }
  }

  vec3 col = uAmbient * ao + sum * mix(1.0, ao, 0.6);
  if (rid >= 0 && int(rb1.z) == MAT_EMISSIVE) col = max(col, B2(rid).rgb);

  col = pow(min(col, vec3(1.0)), vec3(1.0 / 2.2));      // linear -> sRGB for the blend
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;          // dither dark gradients
  outColor = vec4(col, 1.0);
}`;
