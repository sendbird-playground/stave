# GitHub Pages Landing Page

Stave ships a static landing page for product introduction under `landing/`.

## Scope

The landing is intentionally product-focused.

- no pricing section
- no company/team section
- clear explanation of what Stave does
- direct links to install guide, source, and releases

## Files

- `landing/index.html` — content structure
- `landing/styles.css` — visual system, responsive layout, motion
- `landing/app.js` — lightweight reveal animation + footer year
- `landing/assets/` — logo and screenshot used by the page

## Deployment

GitHub Pages deployment is handled by:

- `.github/workflows/github-pages-landing.yml`

Workflow behavior:

- trigger: push to `main` when `landing/**` or workflow file changes
- trigger: manual `workflow_dispatch`
- artifact path: `landing/`
- deploy target: GitHub Pages environment

## Local Preview

Any static server works because the landing has no build step.

```bash
cd landing
python3 -m http.server 4173
```

Then open `http://localhost:4173`.
