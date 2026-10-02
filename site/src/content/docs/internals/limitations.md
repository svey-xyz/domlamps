---
title: Limitations
description: Known trade-offs and what's planned.
---

- **Tops only.** Boxes have no side walls in the render; the view is straight down. An isometric view would need the shader to un-project a vertical offset, and every layout rect would then disagree with where the box appears.
- **Rects, not shapes.** Shadows come from the element's box and corner radius. Text glyphs, SVG shapes and `clip-path` don't cast their own silhouette.
- **Rotation** uses the axis-aligned bounding box of the rotated element.
- **Fixed and sticky boxes** move relative to the document during scroll, which the engine doesn't track yet. Dispatch `domlamps:invalidate` on scroll if you need them.
- **One scene per document.** The light map covers the whole document; scoping it to a container isn't supported yet.
- **Limits:** 128 boxes and 8 lights per band. Beyond that the next step is a tiled light list.
- **No WebGL2** means no overlay: the page renders fully lit, which is a safe fallback.

## Roadmap

- Profile on mid-range Android and iPhone; pick the default `scale` from the results.
- Per-box alpha masks for text and SVG silhouettes.
- Container-scoped scenes (for embedding in docs and design systems).
- React wrapper components.
