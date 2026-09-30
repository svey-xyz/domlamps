# Lumen — 2.5D DOM Lighting

Sep 30, 2026 · @svey

## Overview

Lumen gives ordinary HTML the lighting of a top-down game. Elements have a real height, some of them emit light, and everything else casts or passes shadows. The page stays a normal website: layout, scrolling, text selection, links and forms are all native DOM.

Live demo: [Lumen prototype](https://claude.ai/artifact/2rrayV7AmHLNZAHnJADLQG). The source is the `lumen.zip` Astro project.

The prototype is an Astro site with three demo rooms:

- **Hero:** a draggable light orb over five blocks of different heights and materials.
- **Materials:** a sweeping spot light over five equal-height blocks, one per material.
- **Read more:** an article that starts in candlelight, with a glass button that pops out of the page and lights a lantern.

The lighting is one vanilla TypeScript module (about 6 kB) plus one WebGL2 fragment shader. It has no framework or 3D engine dependency.

**Why Astro over Next.js:** the page is static content with one interactive layer. Astro ships zero JavaScript by default, so the only script on the page is the lighting engine and two small inline handlers. Next.js would add a React runtime and hydration for nothing, since the engine reads the DOM directly and never renders through React. The engine is framework-agnostic and would drop into a Next.js app unchanged if a later project needs it.

## Scene model

The scene is the page seen from directly above. Each tagged element is a block standing on the floor, and each light is a point hovering at some height.

**Boxes** (`data-box`): the element's layout rect is the footprint, `border-radius` rounds its corners, and `--z` is its height in CSS px. The box is treated as a solid extruded from z = 0 to z = `--z`. Its top surface receives light; the whole volume can block light.

**Lights** (`data-light`): the element's centre is the light's x and y. `--lz` is its height. When the light sits inside a box, `--lz` is measured from that box's top, so `--lz: -12` means "12px inside".

| Light property | Controls | Default |
| --- | --- | --- |
| `data-light` | `point`, `spot` or `sun` | `point` |
| `--lz` | height, CSS px | 80 |
| `--intensity` | brightness multiplier | 1 |
| `--radius` | falloff distance, CSS px | 400 |
| `--light-color` | any CSS colour | white |
| `--dir`, `--cone` | spot aim and cone angle | 90deg, 50deg |
| `--elevation` | sun angle above the horizon | 45deg |
| `--size` | point/spot emitter radius, CSS px (bigger = softer light and shadows) | 12 |
| `--spread` | sun angular radius (bigger = softer shadows) | 2deg |
| `data-flicker` | flicker amplitude, 0–1 | 0 |

**Materials** (`data-material`) decide what a box does to light passing through it. `--tint` colours the transmitted light and `data-opacity` overrides how much is blocked.

| Material | Blocks | Shadow it casts | Top surface |
| --- | --- | --- | --- |
| `solid` | 100% | black | matte |
| `paper` | 60% | dim, warm | matte |
| `glass` | 30% | tinted by `--tint` | slight sheen |
| `metal` | 100% | black | strong specular highlight |
| `emissive` | none | none | glows at its own colour |

### The height rules

These come straight out of the geometry, with no special cases:

1. **Light above a top lights it.** A top faces straight up, so its brightness is the vertical component of the direction to the light: (light z − top z) ÷ distance. A light directly overhead gives full brightness; a light off to the side gives grazing light.
2. **Light at or below a top cannot light it.** That same term is zero or negative, so the top stays in ambient darkness. A large light sinks below the horizon gradually: while part of its sphere is still above the top, the top gets that part.
3. **A block taller than the light blocks it completely.** Every ray from the far side has to pass through the block, so light only spills around its sides. This is the obelisk in the hero.
4. **A block shorter than the light casts a finite shadow.** Its length follows similar triangles: a block of height h at distance d from a light at height L throws a shadow d × h ÷ (L − h) long. Raising the light shrinks it.
5. **A light inside its own box becomes a lantern.** The owning box never blocks its own light, so light leaves through the sides. Its top shows only what leaks through the material, which is why the amber glass button glows.

## Rendering pipeline

The renderer draws a light map: a canvas where white means "leave the content as it is" and black means "darkness". The canvas sits above the content with `mix-blend-mode: multiply`, so the page itself is never redrawn or moved.

One fullscreen triangle runs a fragment shader. For every pixel of the light map it does four things:

1. **Find the receiver.** Loop over the boxes and keep the tallest one whose footprint contains the pixel. That gives the surface height `hp` (0 for the floor).
2. **Contact shadow.** Darken the pixel a little when it sits next to a taller box, scaled by the height difference. This ambient-occlusion term is what makes blocks look planted.
3. **Light it.** For each light: distance falloff, spot cone, and the N·L term. Every top faces up, so N·L is simply the z of the direction to the light, which is where the height rules come from.
4. **Shadow it.** For each box that could lie between the pixel and the light, find how much of the light (a sphere, not a point) that single box hides. The result is a soft visibility between 0 and 1, blended with the box's transmit colour: black for solid, tinted for glass. The per-box results multiply together.

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

Tracing each box separately, instead of the whole scene as one distance field, is what lets materials differ. Glass can let 70% of the light through tinted cyan while the solid block next to it lets through none, and a ray that crosses both picks up both effects.

Some details that matter for the look:

- **Linear light.** Colours are converted to linear RGB, summed, then encoded back to sRGB for the blend. Coloured lights mix correctly and falloff looks natural.
- **Soft penumbrae** come from treating each light as a sphere of radius `--size` (sun: angular radius `--spread`). The penumbra straddles the hard shadow edge and follows real geometry: it is sharp where a block meets the floor, widens with distance from the block, and gets wider as the light gets bigger or closer. Both properties are registered, so softness can be animated.
- **Big lights next to blocks.** The part of a light's sphere inside a box is hidden by it. So against each box the shader uses the largest sphere inside the light that doesn't overlap it. A big light pressed against a block still throws a wide soft shadow behind it, and never throws one on its own far side.
- **Emissive boxes** output their own colour as a minimum, so a glowing sign is never darkened.
- **Bloom.** Multiply can only darken, so light glows go on a second 2D canvas with `mix-blend-mode: screen`.
- **Dithering.** One level of noise per pixel stops banding in dark gradients.

## Project architecture

The engine reads the DOM and never writes to it. Everything it knows comes from layout rects and computed styles, so any tool that produces HTML and CSS can drive it.

&#91;embedded content: data flow · markup to pixels\]

Data flows one way: markup and CSS set the scene, the browser lays it out, the engine samples it, and the shader paints a layer on top.

```
src/
  lib/lumen/
    engine.ts      Lumen class: observers, frame loop, DOM → GPU sync, bloom
    shader.ts      GLSL: receiver, AO, lighting, per-box soft shadows
    color.ts       any CSS colour → linear RGB (via a 1×1 canvas, cached)
    lumen.css      @property registrations, canvas + bulb styles
  components/
    Lumen.astro    <lumen-scene> custom element that starts the engine
    Box.astro      polymorphic wrapper: data-box, --z, material, tint
    Light.astro    data-light + light custom properties
    ReadMore.astro the lantern article
    Inspector.astro live controls for the orb
  pages/index.astro  the three demo rooms
```

**The markup API is plain attributes.** `Box` and `Light` are thin conveniences. `<div data-box style="--z:40">` works the same, which keeps it usable from a CMS rich-text field, Next.js, or hand-written HTML.

**How DOM state reaches the GPU:**

- **Discovery:** `querySelectorAll('[data-box]', '[data-light]')`, refreshed by a `MutationObserver` when nodes or those attributes change.
- **Change detection:** the same observer watches `style`, `class`, `hidden` and `open`, so dragging a light or toggling a class schedules a frame. A `ResizeObserver` on the root catches reflow, and `document.fonts.ready` catches late font swaps.
- **Animation:** `transitionrun` and `animationstart` add the target to an active set. The loop keeps rendering while any element in the set still has running animations (`el.getAnimations()`) and is near the viewport.
- **Sync:** each frame reads `getBoundingClientRect()` (which includes transforms, so `scale` pops are free) and `getComputedStyle()` for the registered properties. It then writes a 128×3 RGBA32F box texture and four `vec4` arrays of light data.
- **Styling hooks:** `--z`, `--lz`, `--intensity`, `--radius`, `--light-color`, `--dir`, `--cone` and `--elevation` are registered with `@property`. That registration is what lets CSS transitions and keyframes interpolate them.

## The read-more interaction

The whole effect is CSS transitions on registered custom properties. The script only flips `aria-expanded`.

```astro
<Box as="article" z={6} class="rm">
  <Light class="candle" z={26} radius={320} color="#ffb163" flicker={0.28} />
  <!-- heading and paragraphs: plain DOM -->
  <Box as="button" material="glass" tint="#ffae3d" class="rm-btn" aria-expanded="false">
    <Light class="lantern" z={-12} radius={820} color="#ffc47e" />
    <span class="rm-label">Light the lantern</span>
  </Box>
</Box>
```

```css
.rm-btn { --z: 10; transition: --z .75s var(--spring), translate .75s var(--spring), scale .75s var(--spring); }
.rm-btn[aria-expanded='true'] { --z: 72; translate: -50% -22px; scale: 1.14; }
.rm-btn .lantern { --intensity: 0; transition: --intensity .9s ease-out .18s; }
.rm-btn[aria-expanded='true'] .lantern { --intensity: 2.3; }
```

What happens when it is clicked:

1. **Before:** the article is a paper box at z 6. Two flickering candles 26px above it light the heading, and the paragraphs fall off into the ambient colour.
2. **The pop:** the button's height animates from 10 to 72 with an overshooting curve, while `scale` and `translate` lift it visually. The engine sees the `transitionrun` event and renders every frame until the transition ends, reading `--z` and the transformed rect each frame.
3. **The lantern:** 180ms later its intensity eases up to 2.3. It sits 12px below the button's top, at z 60, so rule 5 applies. The button never shadows its own lantern, and its top glows amber through the glass.
4. **The spill:** the article top (z 6) is 54px below the lantern, so the text is lit from the button outward. It falls off over 820px and is warmed by the lantern's colour. The article also throws a short shadow onto the floor past its edges.

Nothing in this sequence is scripted animation, so the same markup works with any transition, `@starting-style`, or a scroll-driven animation.

## Performance

The engine renders only when something changed. A static page costs nothing after the first frame, and scrolling costs nothing at all.

| Technique | What it saves |
| --- | --- |
| Canvas band 3× the viewport tall, absolutely positioned in the document | Native scrolling moves the light map with the content. No per-scroll render, and no lag or "swimming" between the lighting and the text. It re-centres only when the viewport nears its edge. |
| Render on demand | Frames run only after a mutation, a resize, or while a transition or animation is running near the viewport. Flickering lights keep it running only while they are on screen. |
| Viewport scissor while moving | During drags and transitions, only the visible rows are shaded. The rest of the band is refreshed once, 150ms after motion stops. |
| Half-resolution light map | Light is low-frequency, so rendering at 0.5 CSS px per px costs a quarter of the pixels with no visible loss. It can be set to ¼ or full. |
| Per-box culling in the shader | Before tracing, each box is tested against the ray's bounding rect plus the penumbra margin. Most boxes are rejected with four comparisons. |
| Box data in a float texture | Up to 128 boxes stay well inside WebGL2's minimum uniform budget. Lights (up to 8) use uniforms. |
| CPU culling | Boxes more than 700px outside the band, and lights whose radius doesn't reach it, are never uploaded. |

The cost that grows is lights × nearby boxes × 21 SDF evaluations, per pixel. As a working budget, keep 4 or fewer lights and about 30 boxes in view. The shader has not yet been profiled on low-end phones; that is the first thing to measure before using this on a client site.

## Limitations and next steps

Known trade-offs in the prototype:

- **Accessibility is set aside, as requested.** Lighting changes the contrast of real text. Before any production use, add a `prefers-contrast` / `forced-colors` bypass and a visible "lights on" toggle. The inspector's "Plain DOM" switch already shows the page without the overlay.
- **Tops only.** Boxes have no side walls in the render; the view is straight down. An isometric view needs the shader to un-project a vertical offset, and every layout rect then disagrees with where the box appears.
- **Rects, not shapes.** Shadows come from the element's box and corner radius. Text glyphs, SVG shapes and `clip-path` don't cast their own silhouette. An alpha mask per box is possible but costs a texture per element.
- **Fixed and sticky boxes** move relative to the document during scroll, which the engine doesn't listen for. That can be fixed by marking them and invalidating on scroll.
- **Limits:** 128 boxes and 8 lights per band. Beyond that, the next step is a tiled light list.
- **No WebGL2** (rare now) means no overlay: the page renders fully lit, which is a safe fallback.

Worth doing next:

- [ ] Profile on a mid-range Android phone and an iPhone, and set the default scale from the result.
- [ ] Add per-box alpha masks for text and SVG silhouettes.
- [ ] Package the engine as a standalone npm module with `Box` / `Light` wrappers for Astro and React.
- [ ] Model light and material presets as Sanity objects so editors can pick "candle" or "amber glass" in the CMS.
