# Soul Prosperity Funnel Command Center

Standalone repo for the Soul Prosperity offer ladder command center.

## What this is

This is the master control page for the ebook funnel:

- Freebie
- $7 eBook
- $17 audiobook bundle
- $27 paperback bundle
- $67 online course bundle
- $47/month Skool membership
- $247/year Skool annual
- $497 lifetime access

It consolidates the funnel map, GHL automation plan, launch checklist, content plan, and money metrics into one launch dashboard.

## Run locally

```bash
npm install
npm run dev
```

Then open:

```text
http://127.0.0.1:3000
```

To run the same validation CI runs:

```bash
npm run check
```

## Repo structure

```text
index.html
styles.css
app.js
config.js
source-assets/
```

The `source-assets` folder contains the original standalone HTML assets that this command center links to.

## Editing the link config

All external destinations live in `config.js`. This is the single file to edit as each piece of the funnel goes live. Open the file and replace the `"#"` placeholder for each key with the real URL:

```js
window.SP_CONFIG = {
  freebieOptIn: "https://...",       // Free gift opt-in page
  ebook7Checkout: "https://...",     // $7 eBook checkout
  audio17Checkout: "https://...",    // $17 audiobook checkout
  paperback27Checkout: "https://...",// $27 paperback checkout
  course67Checkout: "https://...",   // $67 course checkout
  skoolTrial: "https://...",         // Skool 7-day trial
  skoolAnnual: "https://...",        // $247/yr Skool annual
  lifetimeAccess: "https://...",     // $497 lifetime access
  ghlDashboard: "https://...",       // GHL dashboard shortcut
  ghlWorkflows: "https://...",       // GHL workflow builder
  analytics: "https://...",          // Analytics / revenue dashboard
  socialBioLink: "https://...",      // Public bio link for social profiles
};
```

A value is treated as a **placeholder** if it is empty, `"#"`, or starts with `REPLACE_`. Any other value is treated as **ready** and wired into the UI buttons that reference it.

The **Launch Links** panel at the bottom of the page lists every required link, its purpose, and whether it is still a placeholder. Use it as the wiring checklist when preparing for launch.

No build step is required — edit `config.js`, save, and reload the page.

## Design direction

Black and gold street-gospel command dashboard. The site defaults to dark mode and includes a temporary in-memory light mode toggle for accessibility checks.

## CI checks

Every push and PR to `main` runs the `CI` workflow in `.github/workflows/ci.yml`:

- `npm ci` (when `package-lock.json` is present)
- `node --check app.js`
- `node --check config.js`
- `node --check scripts/validate.js`
- `node scripts/validate.js` — verifies required files, resolves local asset paths referenced from `index.html`, and fails if any forbidden browser storage APIs (`localStorage`, `sessionStorage`, `indexedDB`, `document.cookie`) appear in `app.js` or `config.js`.

Run the same checks locally before pushing:

```bash
npm run check
```

## Deploying to Vercel

This repo is configured for zero-config Vercel deployment as a pure static site. The root `vercel.json` declares no build step and lets Vercel serve `index.html` at `/` and every other file (including `source-assets/*.html`) at its literal path. There is intentionally no SPA catch-all rewrite — a catch-all would shadow the standalone HTML assets in `source-assets/`.

### Import the repo

1. Go to [vercel.com/new](https://vercel.com/new) and import the GitHub repo `gmoney0112-create/soul-prosperity-command-center`.
2. On the **Configure Project** screen:
   - **Framework Preset:** `Other` (static HTML).
   - **Root Directory:** leave as the repo root.
   - **Build Command:** leave empty (or set to an empty string / `None`). No build is required.
   - **Output Directory:** leave empty — Vercel serves the repo root directly.
   - **Install Command:** leave empty. `npm install` is not needed for serving; it is only used by CI and local dev.
3. Click **Deploy**. Vercel will publish the repo files as-is and honor the settings in `vercel.json`.

### What Vercel serves

- `/` → `index.html`
- `/styles.css`, `/app.js`, `/config.js` → served verbatim
- `/source-assets/funnel-map.html`, etc. → served verbatim, direct-linkable
- `cleanUrls: true` means `/source-assets/funnel-map` also resolves to the same page

### Editing the link config after deploy

All external destinations live in `config.js` at the repo root. To update a funnel link in production, edit `config.js` on `main`, commit, and push — Vercel will redeploy automatically. No build or environment variables are involved. See the **Editing the link config** section above for the keys and placeholder rules.

## Deploying to GitHub Pages

Pushes to `main` also trigger `.github/workflows/pages.yml`, which validates the site and publishes it to GitHub Pages via the official `actions/deploy-pages` flow. No build step is used — the repo files are published as-is, minus CI-only paths (`.github/`, `scripts/`, `node_modules/`, `package.json`, `package-lock.json`, `source-assets.zip`).

> **Note on private repos:** GitHub Pages publishing from a private repo requires GitHub Pro / Team / Enterprise. On the free plan, the `Deploy to GitHub Pages` workflow will fail with a permissions error when the repo is private. Use Vercel (above) as the primary host in that case; the Pages workflow can be ignored or disabled without affecting the site.

### One-time setup (if Pages is not yet enabled)

1. Open the repo on GitHub → **Settings** → **Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to `main` (or run the `Deploy to GitHub Pages` workflow manually from the Actions tab). The deployed URL will appear in the workflow run summary and on the Pages settings screen.

The workflow includes a `.nojekyll` marker so asset paths (e.g. `source-assets/`) are served verbatim.
