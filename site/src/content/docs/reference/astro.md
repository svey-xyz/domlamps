---
title: Astro components
description: Box, Light and DomLamps from domlamps/astro.
---

```astro
---
import { Box, DomLamps, Light } from 'domlamps/astro';
---
```

The components are thin conveniences over the [markup API](../markup/): each prop becomes an attribute or custom property, and only props you pass are emitted, so your CSS (and transitions) can own the rest. They need `astro` ≥ 4 as a peer dependency.

## `<DomLamps>`

Mounts the engine. Place once per page, typically in a layout.

| Prop | Type | |
| --- | --- | --- |
| `scale` | `number` | Light-map resolution. |
| `ambient` | `string` | Ambient colour. Omit to set `--domlamps-ambient` in CSS. |
| `band` | `number` | Band height in viewports. |

## `<Box>`

| Prop | Type | Maps to |
| --- | --- | --- |
| `as` | any HTML tag | Element rendered (default `div`). |
| `z` | `number` | `--lamp-z` |
| `material` | `MaterialName` | `data-material` (default `solid`) |
| `tint` | `string` | `--lamp-tint` |
| `opacity` | `number` | `data-opacity` |
| `shine` | `number` | `data-shine` |
| `glow` | `number` | `data-glow` |

All other props pass through to the element.

## `<Light>`

Renders an `aria-hidden` `<span class="domlamps-light">`. Position it with `style` or a class.

| Prop | Type | Maps to |
| --- | --- | --- |
| `type` | `'point' \| 'spot' \| 'sun'` | `data-light` |
| `z` | `number` | `--lamp-height` |
| `intensity` | `number` | `--lamp-intensity` |
| `radius` | `number` | `--lamp-radius` |
| `color` | `string` | `--lamp-color` |
| `dir`, `cone`, `elevation`, `spread` | `number` (degrees) | `--lamp-dir`, `--lamp-cone`, `--lamp-elevation`, `--lamp-spread` |
| `size` | `number` | `--lamp-size` |
| `flicker` | `number` | `data-flicker` |
| `bloom` | `number` | `data-bloom` |
| `reach` | `number` | `data-reach` |
