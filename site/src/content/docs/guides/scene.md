---
title: The scene model
description: Boxes, lights, heights and the rules that fall out of the geometry.
---

The scene is the page seen from directly above. Each tagged element is a block standing on the floor, and each light is a point hovering at some height.

## Boxes

Any element with `data-box`.

- Its **layout rect** is the footprint, and `border-radius` rounds its corners.
- `--lamp-z` is its **height** in CSS px. The box is a solid extruded from z = 0 to z = `--lamp-z`.
- Its top surface receives light; the whole volume can block light.

```html
<div data-box style="--lamp-z: 40">…</div>
```

Transforms count: the engine reads `getBoundingClientRect()`, so `scale`, `translate` and `rotate` (as an axis-aligned bounding box) all move the footprint.

## Lights

Any element with `data-light`. Its **centre** is the light's x and y; `--lamp-height` is its height.

```html
<span data-light="spot" style="left:0;top:0;--lamp-height:120;--lamp-dir:90deg;--lamp-cone:40deg"></span>
```

There are three types:

| `data-light` | Behaves like |
| --- | --- |
| `point` (default) | A bulb: light in every direction, fading to zero at `--lamp-radius`. |
| `spot` | A point light limited to a cone aimed at `--lamp-dir`. |
| `sun` | Parallel light from `--lamp-dir`, at `--lamp-elevation` above the horizon. Position doesn't matter. |

Lights are spheres, not points. `--lamp-size` (the sun: `--lamp-spread`) is the emitter's radius, and bigger lights give softer light and wider penumbrae.

When a light sits **inside** a box, `--lamp-height` is measured from that box's top, so `--lamp-height: -12` means "12px inside". See rule 5.

## The height rules

These come straight out of the geometry; there are no special cases.

1. **Light above a top lights it.** A top faces straight up, so its brightness is the vertical component of the direction to the light. Directly overhead is full brightness; off to the side is grazing light.
2. **Light at or below a top cannot light it.** A large light sinks below the horizon gradually: while part of its sphere is above the top, the top gets that part.
3. **A block taller than the light blocks it completely.** Light only spills around its sides.
4. **A block shorter than the light casts a finite shadow.** A block of height *h* at distance *d* from a light at height *L* throws a shadow *d × h ÷ (L − h)* long. Raising the light shrinks it.
5. **A light inside its own box becomes a lantern.** The owning box never blocks its own light, so it leaves through the sides. The top shows only what leaks through the material.

Every rule is checked against real WebGL output in the test suite (`packages/domlamps/test/browser/rendering.test.ts`).

## Ambient light

The colour of "darkness" is `--domlamps-ambient` on `:root` (or the `ambient` attribute of `<dom-lamps>`). Anything no light reaches is multiplied by it.

```css
:root { --domlamps-ambient: #1b1e26; }
```

## Layering

The light map sits above your content at `z-index: var(--domlamps-layer, 50)`. Anything with a higher z-index (a fixed header, a modal, a control panel) is never darkened.
