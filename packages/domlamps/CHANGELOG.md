# Changelog

All notable changes to `domlamps` are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## Unreleased

First public release, extracted from the Lumen prototype.

### Added

- `DomLamps` engine class with `start`, `destroy`, `invalidate`, `render`, `setScale` and `setEnabled`.
- `<dom-lamps>` custom element (`domlamps/define`) with live `scale` and `ambient` attributes.
- Astro components `Box`, `Light` and `DomLamps` (`domlamps/astro`).
- The engine registers its custom properties itself; `domlamps/domlamps.css` is now optional.
- `disableWhen` option: the overlay switches off under forced colours and `prefers-contrast: more` by default.
- WebGL context loss and restore handling.
- A one-time console warning when the 128-box or 8-light limit is exceeded.

### Changed

- All custom properties are prefixed `--lamp-` (`--z` → `--lamp-z`, `--lz` → `--lamp-height`, `--light-color` → `--lamp-color`, `--tint` → `--lamp-tint`, and so on), so registering them can't break a host site's own variables.
- `--lumen-ambient` → `--domlamps-ambient`, `--lumen-layer` → `--domlamps-layer`, `lumen:invalidate` → `domlamps:invalidate`, `.lumen-*` classes → `.domlamps-*`.
- The engine no longer sets `window.lumen`; use `document.querySelector('dom-lamps').engine`.
- `data-flicker`, `data-bloom`, `data-glow` and `data-reach` changes now trigger a re-render.

### Fixed

- A light far below a surface lit that surface: the sphere-light horizon term rose again past the horizon.
- Invalid colours resolved to black instead of the fallback.
- The colour cache grew without bound while colours animated.
- `data-material="constructor"` (and other `Object.prototype` keys) produced NaN materials.
- The engine re-rendered in response to its own canvas style changes.
