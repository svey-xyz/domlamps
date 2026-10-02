# Contributing

## Setup

Node 24 (see `.nvmrc`) and npm.

```sh
npm install
npm run dev          # demo + docs at http://localhost:4321
```

The site resolves `domlamps` to its TypeScript sources (the `lamps-source` export condition), so there is no library build step during development.

## Scripts

Run from the repo root:

| Script | |
| --- | --- |
| `npm run dev` | Demo and docs site with hot reload |
| `npm test` | Unit tests (Vitest, Node) |
| `npm run test:browser` | Rendering tests in headless Chromium (WebGL2 via SwiftShader) |
| `npm run typecheck` | `tsc` for the library, `astro check` for the site |
| `npm run lint` / `npm run format` | Biome |
| `npm run build` | Library (`packages/domlamps/dist`) then site (`site/dist`) |
| `npm run check` | Everything CI runs |

Browser tests need Playwright's Chromium once: `npx playwright install chromium` (inside `packages/domlamps`). To use a Chromium you already have, set `CHROMIUM_PATH`.

## Tests

- `packages/domlamps/test/unit`: pure modules (band layout, DOM → scene records, buffer packing, colour maths, property registry).
- `packages/domlamps/test/browser`: real WebGL output. Each test builds a small scene, renders it and samples the light map. The height rules from the docs each have a test; if you change the shader, these are the ones that matter.

## Releasing

1. Add your changes under `## Unreleased` in `packages/domlamps/CHANGELOG.md`, then rename that heading to the new version.
2. Bump the version: `npm version <patch|minor|major> -w domlamps --no-git-tag-version`.
3. Commit, then tag and push: `git tag v0.2.0 && git push --follow-tags`.

Pushing a `v*` tag runs the release workflows:

| Where | Workflow | Does |
| --- | --- | --- |
| GitHub | `.github/workflows/release.yml` | Checks, publishes to **npm** with provenance (trusted publishing, no token), creates a GitHub release with the tarball, deploys the docs to **GitHub Pages** |
| Gitea | `.gitea/workflows/release.yml` | Checks, publishes to the **Gitea npm registry**, creates a Gitea release with the tarball |

Tags with a pre-release suffix (`v0.2.0-beta.1`) publish under the `next` dist-tag.

### One-time setup

- **Gitea → GitHub mirror:** in the Gitea repo, *Settings → Repository → Mirror settings → Push mirror* to `https://github.com/svey-xyz/domlamps.git` with a GitHub token that has `contents: write` (and `workflows: write`). Tick *sync on commit*.
- **npm:** publish the first version by hand (`npm publish -w domlamps`), then on npmjs.com add a *trusted publisher* for the package: GitHub Actions, repo `svey-xyz/domlamps`, workflow `release.yml`, environment `npm`.
- **GitHub Pages:** *Settings → Pages → Source: GitHub Actions*.
- **Gitea:** enable Actions for the repo and add a secret `PACKAGES_TOKEN`: a Gitea access token with `write:package` and `write:repository`.
