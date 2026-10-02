---
title: Performance
description: What it costs, and what keeps the cost down.
---

The engine renders only when something changes. A static page costs nothing after the first frame, and scrolling costs nothing at all.

| Technique | What it saves |
| --- | --- |
| Canvas band 3× the viewport tall, absolutely positioned in the document | Native scrolling moves the light map with the content: no per-scroll render, and no lag between lighting and text. It re-centres only when the viewport nears its edge. |
| Render on demand | Frames run only after a mutation, a resize, or while a transition or animation is running near the viewport. Flickering lights keep it running only while on screen. |
| Viewport scissor while moving | During drags and transitions only the visible rows are shaded. The rest of the band is refreshed once, 150 ms after motion stops. |
| Half-resolution light map | Light is low-frequency; 0.5 px per CSS px costs a quarter of the pixels with no visible loss. `scale` sets ¼ to full. |
| Per-box culling in the shader | Each box is tested against the ray's bounding rect plus the penumbra margin. Most boxes are rejected with four comparisons. |
| Box data in a float texture | Up to 128 boxes stay well inside WebGL2's minimum uniform budget. Lights (up to 8) use uniforms. |
| CPU culling | Boxes more than 700px outside the band, and lights whose radius doesn't reach it, are never uploaded. |

The cost that grows is lights × nearby boxes × ~21 SDF evaluations, per pixel. As a working budget, keep **4 or fewer lights and about 30 boxes in view**.

:::caution
The shader hasn't been profiled on low-end phones yet. Measure on a mid-range Android device before shipping to a broad audience, and consider `scale: 0.25` there.
:::
