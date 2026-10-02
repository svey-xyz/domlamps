---
title: Materials
description: What boxes do to the light that passes through them.
---

`data-material` decides what a box does to light passing through it. `--lamp-tint` colours the transmitted light (any CSS colour), and `data-opacity` overrides how much is blocked.

| Material | Blocks | Shadow it casts | Top surface |
| --- | --- | --- | --- |
| `solid` (default) | 100% | black | matte |
| `paper` | 60% | dim, warm | matte |
| `glass` | 30% | tinted by `--lamp-tint` | slight sheen |
| `metal` | 100% | black | strong specular highlight |
| `emissive` | none | none | glows at its own colour |

```html
<div data-box data-material="glass" style="--lamp-z:30; --lamp-tint:#2fd0e3">Cyan glass</div>
<div data-box data-material="paper" data-opacity="0.8" style="--lamp-z:14">Thick paper</div>
<footer data-box data-material="emissive" data-glow="0.9" style="--lamp-z:2; --lamp-tint:#dfe4ec">Sign</footer>
```

## Overrides

| Attribute | Range | Effect |
| --- | --- | --- |
| `data-opacity` | 0–1 | Fraction of light blocked. |
| `data-shine` | 0–1 | Specular strength of the top. |
| `data-glow` | ≥ 0 | Emissive brightness multiplier. |

Shadows from several boxes multiply: a ray that crosses cyan glass and then magenta glass picks up both tints. This is possible because the shader traces each box separately rather than the whole scene as one distance field.

:::note
`--lamp-tint` is deliberately not registered with `@property`, so it accepts any colour value, including one shared with your own styles (`background: color-mix(in oklab, var(--lamp-tint) 40%, transparent)`).
:::
