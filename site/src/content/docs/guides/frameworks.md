---
title: Framework integration
description: Use domlamps with Astro, React / Next.js, Vue, Svelte or plain HTML.
---

The engine reads the DOM and never writes to your content, so it works with anything that renders HTML. The markup API is plain attributes and custom properties; the framework only has to render them.

## Astro

domlamps ships Astro components as source under `domlamps/astro`.

```astro
---
import { Box, DomLamps, Light } from 'domlamps/astro';
---
<Box z={90} class="pillar">Pillar</Box>
<Box z={30} material="glass" tint="#2fd0e3">Glass</Box>
<Light z={140} radius={640} color="#ffe3bd" style="left:40%;top:50%" />

<!-- once per page, e.g. in your layout -->
<DomLamps ambient="#1b1e26" scale={0.5} />
```

`Box` is polymorphic (`as="article"`, `as="button"`, …). See the [Astro reference](../../reference/astro/).

## React / Next.js

Mount the engine in an effect, and render boxes and lights as plain elements. In the App Router this must be a client component.

```tsx
'use client';
import { useEffect } from 'react';
import { DomLamps } from 'domlamps';
import 'domlamps/domlamps.css';

export function Lighting({ ambient = '#1b1e26' }: { ambient?: string }) {
  useEffect(() => {
    document.documentElement.style.setProperty('--domlamps-ambient', ambient);
    const lamps = new DomLamps();
    lamps.start();
    return () => lamps.destroy();
  }, [ambient]);
  return null;
}

// Anywhere in your tree (server components are fine):
<div data-box data-material="paper" style={{ '--lamp-z': 14 } as React.CSSProperties}>…</div>
```

Alternatively render `<dom-lamps>` after importing `domlamps/define` in a client component. React 19 passes attributes to custom elements directly.

## Vue, Svelte, Solid, Lit…

Import the side-effect entry once on the client and render the element:

```js
import 'domlamps/define';
```

```html
<dom-lamps ambient="#1b1e26" scale="0.5"></dom-lamps>
```

In Vue, tell the compiler `dom-lamps` is a custom element (`compilerOptions.isCustomElement: (tag) => tag === 'dom-lamps'`).

## Server-side rendering

Every entry point is safe to import on the server: nothing touches `window` or `document` until `start()` (or the element's `connectedCallback`) runs in the browser.

## CMS content

Because the API is attributes and inline custom properties, rich-text fields can carry lighting too: `<div data-box style="--lamp-z:40">` in content from a CMS behaves exactly like a component.
