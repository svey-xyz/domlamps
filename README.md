# domlamps

**Top-down, game-style lighting for ordinary HTML.** Elements have a height, some of them emit light, and everything else casts or passes soft shadows. The page stays a normal website: layout, scrolling, text selection, links and forms are all native DOM.

[![npm](https://img.shields.io/npm/v/domlamps)](https://www.npmjs.com/package/domlamps)
[![CI](https://github.com/svey-xyz/domlamps/actions/workflows/ci.yml/badge.svg)](https://github.com/svey-xyz/domlamps/actions/workflows/ci.yml)
[![License: MPL 2.0](https://img.shields.io/badge/license-MPL--2.0-blue)](./LICENSE)

![A light orb over blocks of different heights; taller blocks throw longer shadows, and the glass block's shadow is tinted](https://raw.githubusercontent.com/svey-xyz/domlamps/main/docs/hero.png)

**[Live demo](https://svey-xyz.github.io/domlamps/) · [Docs](https://svey-xyz.github.io/domlamps/guides/getting-started/)**

- **One WebGL2 shader, no framework.** It paints a light map over the page with `mix-blend-mode: multiply`. Your DOM is never moved or redrawn.
- **Real geometry.** Shadow lengths follow from heights, lights are spheres with soft penumbrae, and glass tints the light that passes through it.
- **Animated by CSS.** Every `--lamp-*` property is registered with `@property`, so transitions and keyframes drive the lighting.
- **Cheap when idle.** It renders on demand, and scrolling costs nothing.
- **Safe fallback.** Without WebGL2, or under forced colours or high contrast, the page renders fully lit.

## Install

```sh
npm install domlamps
```

## Use

```html
<dom-lamps ambient="#1b1e26"></dom-lamps>

<div data-box style="--lamp-z: 90">A pillar, 90px tall</div>
<div data-box data-material="glass" style="--lamp-z: 30; --lamp-tint: #2fd0e3">Cyan glass</div>
<span data-light style="position:absolute; left:40%; top:200px; --lamp-height:140; --lamp-color:#ffe3bd"></span>

<!-- registers <dom-lamps>; or `import 'domlamps/define'` in your bundle -->
<script type="module" src="https://cdn.jsdelivr.net/npm/domlamps/dist/define.js"></script>
```

Or from JavaScript:

```js
import { DomLamps } from 'domlamps';

const lamps = new DomLamps({ scale: 0.5 });
lamps.start(); // false without WebGL2; the page stays fully lit
```

Astro components are included:

```astro
---
import { Box, DomLamps, Light } from 'domlamps/astro';
---
<Box z={90}>Pillar</Box>
<Box z={30} material="glass" tint="#2fd0e3">Glass</Box>
<Light z={140} radius={640} color="#ffe3bd" style="left:40%;top:50%" />
<DomLamps ambient="#1b1e26" />
```

React, Vue, Svelte and plain HTML work too: see [framework integration](https://svey-xyz.github.io/domlamps/guides/frameworks/).

## The model in one table

| | Markup | Key properties |
| --- | --- | --- |
| **Box** | `data-box` | `--lamp-z` (height), `data-material` (`solid` `paper` `glass` `metal` `emissive`), `--lamp-tint` |
| **Light** | `data-light` (`point` `spot` `sun`) | `--lamp-height`, `--lamp-intensity`, `--lamp-radius`, `--lamp-color`, `--lamp-size`, `--lamp-dir`, `--lamp-cone` |
| **Page** | `<dom-lamps>` | `--domlamps-ambient`, `--domlamps-layer` |

Full reference: [markup and CSS](https://svey-xyz.github.io/domlamps/reference/markup/) · [JavaScript API](https://svey-xyz.github.io/domlamps/reference/javascript/).

## Browser support

Any browser with WebGL2 and `@property`: Chrome/Edge 85+, Safari 16.4+, Firefox 128+. Elsewhere the page renders without the overlay.

## Repository

This is a monorepo:

| Path | |
| --- | --- |
| [`packages/domlamps`](./packages/domlamps) | The published library |
| [`site`](./site) | Demo and documentation (Astro + Starlight) |
| [`docs/design`](./docs/design) | The original design notes |

Development happens on [Gitea](https://git.tarte.patisserie.page/svey/lumen) and is mirrored to [GitHub](https://github.com/svey-xyz/domlamps). See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MPL-2.0](./LICENSE). Changes to domlamps' own files must stay open; you can use it in closed-source and commercially licensed projects.
