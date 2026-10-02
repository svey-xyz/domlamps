---
title: Markup and CSS
description: Every attribute and custom property domlamps reads.
---

## Boxes

| Attribute / property | Type | Default | |
| --- | --- | --- | --- |
| `data-box` | flag | | Marks a shadow caster and light receiver. |
| `--lamp-z` | `<number>` | `0` | Height above the floor, CSS px. Animatable. |
| `data-material` | `solid` · `paper` · `glass` · `metal` · `emissive` | `solid` | See [Materials](../../guides/materials/). |
| `--lamp-tint` | any colour | material's | Transmitted colour (glass, paper) or glow colour (emissive). Not registered. |
| `data-opacity` | 0–1 | material's | Fraction of light blocked. |
| `data-shine` | 0–1 | material's | Specular strength of the top. |
| `data-glow` | number | `1` | Emissive brightness. |

The footprint is the element's border box (`getBoundingClientRect()`), and the corner radius is its computed `border-top-left-radius`.

## Lights

| Attribute / property | Type | Default | |
| --- | --- | --- | --- |
| `data-light` | `point` · `spot` · `sun` | `point` | Light type. |
| `--lamp-height` | `<number>` | `80` | Height, CSS px. Inside a box: relative to its top. |
| `--lamp-intensity` | `<number>` | `1` | Brightness multiplier. `0` switches the light off. |
| `--lamp-radius` | `<number>` | `400` | Falloff distance, CSS px (point, spot). |
| `--lamp-color` | `<color>` | `white` | Light colour. |
| `--lamp-dir` | `<angle>` | `90deg` | Spot aim, or the direction sunlight travels. 0 = right, 90deg = down the page. |
| `--lamp-cone` | `<angle>` | `50deg` | Spot cone angle. |
| `--lamp-elevation` | `<angle>` | `45deg` | Sun angle above the horizon. |
| `--lamp-size` | `<number>` | `12` | Point/spot emitter radius, CSS px. Bigger = softer. |
| `--lamp-spread` | `<angle>` | `2deg` | Sun angular radius. Bigger = softer. |
| `data-flicker` | 0–1 | `0` | Flicker amplitude. |
| `data-bloom` | number | `1` (sun `0`) | Glow size multiplier; `0` disables the glow. |
| `data-reach` | number | `1400` | Sun only: maximum shadow length, CSS px. |

## Page

| Property / class | | |
| --- | --- | --- |
| `--domlamps-ambient` | on `:root` | Colour of unlit areas. Defaults to a near-black blue-grey. |
| `--domlamps-layer` | on any ancestor of the canvases | z-index of the light map (default `50`; the glow layer sits one above). |
| `.domlamps-on` | on `<html>` | Present while the overlay is shown. |
| `.domlamps-map`, `.domlamps-bloom` | | The two canvases. |
| `.domlamps-light` | | Optional bulb style from `domlamps/domlamps.css`. |

## Registered properties

`--lamp-*` (except `--lamp-tint`) are registered with `inherits: false` and the syntax above. A value of the wrong type (`--lamp-z: 5px`) is invalid and falls back to the initial value, exactly like any registered property. The engine registers them with `CSS.registerProperty` when it starts; import `domlamps/domlamps.css` to register them before any script runs.

## Limits

128 boxes and 8 lights near the viewport at once. Beyond that, extras are ignored and a warning is logged once.
