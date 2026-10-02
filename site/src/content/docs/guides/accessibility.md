---
title: Accessibility
description: Contrast, reduced motion and letting people turn the lights off.
---

Lighting changes the contrast of real text. domlamps is built so the content underneath never changes, which makes it straightforward to remove the effect for those who need to.

## Built in

- **High contrast and forced colours.** By default the overlay switches off under `(forced-colors: active), (prefers-contrast: more)`, and the page renders fully lit. Change the query with the `disableWhen` option, or pass `false` to never switch off.
- **Reduced motion.** `data-flicker` stops under `prefers-reduced-motion: reduce`. CSS transitions are yours: wrap them in the media query as you normally would.
- **Screen readers.** The canvases are `aria-hidden` and `pointer-events: none`. Lights rendered by the Astro `Light` component are `aria-hidden` too.
- **No WebGL2.** `start()` returns `false` and nothing is added to the page.

## Give people a switch

A visible "lights on/off" control is recommended for any page where the effect lowers text contrast.

```js
const lamps = document.querySelector('dom-lamps').engine;
toggle.addEventListener('change', () => lamps?.setEnabled(toggle.checked));
```

While the overlay is shown, `<html>` has the class `domlamps-on`. Use it to adjust styles that only make sense with lighting:

```css
html:not(.domlamps-on) .candle-only-hint { display: none; }
```

## Check contrast with the lights on

Automated contrast checkers read your CSS colours, not the light map. Check the darkest state of your important text by eye, and keep body text in well-lit areas or above `--domlamps-layer`.
