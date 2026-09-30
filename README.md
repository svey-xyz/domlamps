# Lumen

2.5D, top-down lighting for ordinary HTML. Elements have height (`--z`), lights have height (`--lz`), and a single WebGL2 shader renders a light map that is multiplied over the page. Layout, scrolling, text and events stay native.

## Run

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
```

## Use

```astro
---
import Box from '../components/Box.astro';
import Light from '../components/Light.astro';
---
<Box z={90} class="pillar">Pillar</Box>                       <!-- solid, 90px tall -->
<Box z={30} material="glass" tint="#2fd0e3">Glass</Box>        <!-- tinted shadow -->
<Light z={140} radius={640} color="#ffe3bd" style="left:40%;top:50%" />
```

Or without components:

```html
<div data-box data-material="paper" style="--z:14">…</div>
<span data-light="spot" class="lumen-light" style="--lz:120;--dir:90deg;--cone:40deg;left:0;top:0"></span>
```

`<Lumen />` (already in `layouts/Base.astro`) mounts the engine once per page.

| Box | |
| --- | --- |
| `data-box` | marks a shadow caster / light receiver |
| `--z` | height in CSS px (animatable) |
| `data-material` | `solid` · `paper` · `glass` · `metal` · `emissive` |
| `--tint` | transmitted colour (glass/paper) or glow colour (emissive) |
| `data-opacity`, `data-shine`, `data-glow` | overrides |

| Light | |
| --- | --- |
| `data-light` | `point` · `spot` · `sun` |
| `--lz` | height; relative to the owning box when nested (negative = inside, a lantern) |
| `--intensity`, `--radius`, `--light-color` | brightness, falloff distance (px), colour |
| `--dir`, `--cone`, `--elevation` | spot aim / cone, sun elevation |
| `data-soft`, `data-flicker`, `data-bloom` | shadow hardness, flicker amplitude, glow size |

All custom properties are registered with `@property`, so CSS transitions and keyframes drive the lighting.

Ambient (the darkness) is `--lumen-ambient` on `:root`. `window.lumen.setScale(0.25 | 0.5 | 1)` changes light-map resolution. Dispatch `lumen:invalidate` on `document` after changes the engine can't observe.

## Files

- `src/lib/lumen/engine.ts`: observers, frame loop, DOM → GPU sync, bloom
- `src/lib/lumen/shader.ts`: the light-map fragment shader
- `src/lib/lumen/color.ts`: CSS colour → linear RGB
- `src/lib/lumen/lumen.css`: `@property` registrations and canvas styles
