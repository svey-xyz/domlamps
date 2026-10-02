---
title: How it renders
description: The light map, the shader, and how DOM state reaches the GPU.
---

The engine reads the DOM and never writes to your content. Everything it knows comes from layout rects and computed styles, so any tool that produces HTML and CSS can drive it.

Data flows one way: markup and CSS set the scene, the browser lays it out, the engine samples it, and the shader paints a layer on top.

## The light map

The renderer draws a light map: a canvas where white means "leave the content as it is" and black means "darkness". It sits above the content with `mix-blend-mode: multiply`, so the page itself is never redrawn or moved. Glows can only brighten, which multiply cannot do, so they go on a second 2D canvas with `mix-blend-mode: screen`.

## The shader

One fullscreen triangle runs a fragment shader. For every pixel of the light map it:

1. **Finds the receiver.** Loops over the boxes and keeps the tallest one whose footprint contains the pixel. That gives the surface height (0 for the floor).
2. **Adds contact shadow.** Darkens the pixel a little next to a taller box, scaled by the height difference. This ambient-occlusion term is what makes blocks look planted.
3. **Lights it.** For each light: distance falloff, spot cone, and N·L. Every top faces up, so N·L is simply the z of the direction to the light, which is where the [height rules](../../guides/scene/#the-height-rules) come from.
4. **Shadows it.** For each box that could lie between the pixel and the light, finds how much of the light (a sphere, not a point) that box hides. The result is a soft visibility between 0 and 1, blended with the box's transmit colour. Per-box results multiply.

```glsl
// Shadow from one box: 0 = blocked, 1 = clear, soft in between.
// The rays from the pixel to the light's disc form a cone of radius slope * t.
// sd / r < 0: the box covers the cone's axis; > 1: it misses the cone entirely.
float boxShadow(vec3 ro, vec3 rd, float tMax, vec4 b0, vec4 b1, float slope) {
  // sd (signed, rounded rect extruded to b1.x) is convex along the ray and r is linear,
  // so sd / r has a single minimum: golden-section search, 20 evaluations, no step banding.
  float res = clamp(minimise(sdBox(ro + rd * t, b0, b1.x, b1.y) / (slope * t), 1.0, tMax), -1.0, 1.0);
  return 0.25 * (1.0 + res) * (1.0 + res) * (2.0 - res);  // smoothstep over [-1, 1]
}
// per light:  T *= mix(transmitColour[i], vec3(1), boxShadow(...))
```

Tracing each box separately, instead of the whole scene as one distance field, is what lets materials differ: glass can pass 70% of the light tinted cyan while the solid block beside it passes none, and a ray that crosses both picks up both effects.

Details that matter for the look:

- **Linear light.** Colours are converted to linear RGB, summed, then encoded back to sRGB for the blend, so coloured lights mix correctly.
- **Soft penumbrae** come from treating each light as a sphere of radius `--lamp-size` (sun: `--lamp-spread`). The penumbra straddles the hard shadow edge: sharp where a block meets the floor, wider with distance and with bigger or closer lights.
- **Big lights next to blocks.** Against each box, the shader uses the largest sphere inside the light that doesn't overlap it, so a big light pressed against a block still throws a soft shadow behind it and never one on its own far side.
- **Emissive boxes** output their own colour as a minimum, so a glowing sign is never darkened.
- **Dithering.** One level of noise per pixel stops banding in dark gradients.

## DOM → GPU

| Step | How |
| --- | --- |
| Discovery | `querySelectorAll('[data-box]')` and `('[data-light]')`, refreshed by a `MutationObserver` when nodes or those attributes change. |
| Change detection | The same observer watches `style`, `class`, `hidden`, `open` and the `data-*` attributes. A `ResizeObserver` catches reflow, and `document.fonts.ready` late font swaps. |
| Animation | `transitionrun` and `animationstart` add the target to an active set; the loop renders while any of them still has running animations near the viewport. |
| Sync | Each frame reads `getBoundingClientRect()` (transforms included) and `getComputedStyle()`, then writes a 128×3 RGBA32F box texture and four `vec4` arrays of light data. |

## Source layout

```
packages/domlamps/src/
  engine.ts      DomLamps: observers, frame loop, band layout, bloom
  scene.ts       pure DOM → record → GPU-buffer functions (unit tested)
  band.ts        canvas band geometry (unit tested)
  shader.ts      GLSL: receiver, AO, lighting, per-box soft shadows
  color.ts       any CSS colour → linear RGB
  properties.ts  the registered --lamp-* properties
  element.ts     <dom-lamps>
```
