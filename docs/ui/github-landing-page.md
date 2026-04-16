# GitHub Pages Site

Stave publishes both the product landing page and a static docs site through GitHub Pages.

## Scope

The public site is intentionally simple:

- the root page explains what Stave is and links directly to install/docs
- `/docs/` exposes the curated docs index and rendered Markdown guides
- contributor-only depth still lives in `docs/`, but onboarding paths stay near the top

## Files

- `landing/index.html` — landing page structure
- `landing/styles.css` — landing page visual system
- `landing/docs.css` — shared styling for rendered docs pages
- `landing/app.js` — minimal landing-only behavior
- `landing/assets/` — logo and landing-page screenshot assets
- `scripts/build-pages-site.mjs` — copies the landing, renders `docs/**/*.md`, and writes `.pages-dist/`

## Deployment

GitHub Pages deployment is handled by:

- `.github/workflows/github-pages-landing.yml`

Workflow behavior:

- trigger: push to `main` when `landing/**`, `docs/**`, `package.json`, `bun.lock`, the Pages workflow, or the Pages build script changes
- trigger: manual `workflow_dispatch`
- build step: `bun install --frozen-lockfile --ignore-scripts` then `bun run build:pages`
- artifact path: `.pages-dist/`
- deploy target: GitHub Pages environment

## Local Preview

Build the Pages output first:

```bash
bun run build:pages
```

Then serve the generated directory:

```bash
cd .pages-dist
python3 -m http.server 4173
```

Open `http://localhost:4173` for the product landing page or `http://localhost:4173/docs/` for the docs site.
