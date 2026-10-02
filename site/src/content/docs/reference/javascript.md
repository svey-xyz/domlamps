---
title: JavaScript API
description: The DomLamps class, the <dom-lamps> element and exported helpers.
---

```js
import { DomLamps } from 'domlamps';   // engine + helpers, no side effects
import 'domlamps/define';               // registers <dom-lamps>
import 'domlamps/domlamps.css';         // optional: @property rules + bulb style
```

The package is ESM-only and ships TypeScript declarations.

## `new DomLamps(options?)`

One engine lights the whole document. Create it in the browser (not during SSR).

| Option | Type | Default | |
| --- | --- | --- | --- |
| `scale` | `number` | `0.5` | Light-map px per CSS px, clamped to 0.2–1. Light is low-frequency, so 0.5 costs a quarter of the pixels with no visible loss. |
| `band` | `number` | `3` | Canvas height in viewports. Scrolling within the band costs nothing. |
| `root` | `HTMLElement` | `document.body` | Where the canvases are appended. Must share the document's origin. |
| `disableWhen` | `string \| false` | `'(forced-colors: active), (prefers-contrast: more)'` | Media query that switches the overlay off. |
| `registerProperties` | `boolean` | `true` | Register `--lamp-*` via `CSS.registerProperty`. |

### Methods and properties

| Member | |
| --- | --- |
| `start(): boolean` | Mounts the canvases and starts rendering. Returns `false` (and changes nothing) without WebGL2. Idempotent. |
| `destroy(): void` | Removes canvases and listeners, releases the WebGL context. Idempotent. |
| `invalidate(full = false): void` | Re-render on the next frame. `full` also refreshes the off-screen part of the band. |
| `render(): void` | Render the whole band synchronously. Rarely needed. |
| `setScale(scale): void` | Change resolution at runtime. |
| `setEnabled(on): void` | Show or hide the overlay without tearing down. |
| `scale: number` | Current resolution. |
| `active: boolean` | Whether the overlay is currently shown. |
| `canvas`, `bloomCanvas` | The two canvases. |

### Events

Dispatch `domlamps:invalidate` (exported as `INVALIDATE_EVENT`) on `document` after changes the engine can't observe.

WebGL context loss is handled: rendering pauses and resumes when the browser restores the context.

## `<dom-lamps>`

```html
<dom-lamps scale="0.5" ambient="#1b1e26" band="3"></dom-lamps>
```

Starts an engine when connected and destroys it when removed. `scale` and `ambient` are live; `band` is read on connect. The running engine is `element.engine` (`null` without WebGL2).

`defineDomLamps(tagName = 'dom-lamps')` registers the element under another name; `domlamps/define` calls it for you.

## Helpers

| Export | |
| --- | --- |
| `PROPERTIES` | The registered `--lamp-*` definitions (name, syntax, initial value, description). |
| `registerProperties()` | Registers them. Safe to call repeatedly. |
| `MATERIALS`, `LIGHT_TYPES` | Material presets and light type ids. |
| `linearColor(css, fallback?)` | Any CSS colour to linear RGB. |
| `MAX_BOXES`, `MAX_LIGHTS` | Per-band limits (128, 8). |
| Types | `DomLampsOptions`, `MaterialName`, `LightType`, `Material`, `LampProperty`, `RGB`. |
