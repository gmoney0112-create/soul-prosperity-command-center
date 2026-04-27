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

## GoHighLevel production wiring

The dashboard also exposes a structured `window.SP_CONFIG.ghl` block in `config.js` covering:

- Sub-account `locationId` and operator entry URLs (dashboard, workflows, campaigns, contacts, opportunities, conversations, analytics, booking calendar).
- Marketplace OAuth metadata: public `clientId`, full `installUrl` (the v2 `chooselocation` URL), `redirectUri`, and the recommended scope list.
- Fixed v2 API endpoints (`https://services.leadconnectorhq.com`, token URL, marketplace install base, version header `2021-07-28`).
- Webhook target URL and the recommended subscribed events list (`ContactCreate`, `ContactUpdate`, `ContactTagUpdate`, `OpportunityCreate`, `OpportunityStatusUpdate`, `InboundMessage`, `OutboundMessage`, `OrderCreate`, `AppInstall`, `AppUninstall`).

The **GHL Wiring** section in the top nav shows live status for each value (`ready` / `placeholder` / `placeholder · required`) and renders the static API endpoint reference so an operator never has to leave the page to find the auth header or token URL.

**Secrets do not live in this repo.** OAuth `client_secret`, per-location access/refresh tokens, and the webhook signing secret stay on a backend or serverless function you own. The static dashboard never sees them.

### Bundled serverless layer (`/api/ghl/*`)

This repo also ships a minimal Vercel-compatible serverless layer that implements the OAuth callback and webhook receiver. The static dashboard is unchanged — these routes are additive and only run when deployed to Vercel (or invoked locally via `vercel dev`).

| Route | Purpose |
| --- | --- |
| `GET /api/ghl/health` | Returns JSON about which server env vars are configured. Booleans only — never values. |
| `GET /api/ghl/oauth/callback` | Exchanges `?code=` server-side at `services.leadconnectorhq.com/oauth/token` and forwards the token bundle to `GHL_TOKEN_STORAGE_URL`. Tokens never reach the browser. |
| `POST /api/ghl/webhook` | Verifies `x-wh-signature` HMAC, de-duplicates by `x-wh-id` (best-effort in-memory), allowlists event types, and forwards to `GHL_WEBHOOK_FORWARD_URL` if set. |

Configure these env vars in the Vercel project (see `.env.example` and [`docs/GHL_SETUP.md`](./docs/GHL_SETUP.md) §5b for full details):

- `GHL_CLIENT_ID`, `GHL_CLIENT_SECRET`, `GHL_OAUTH_REDIRECT_URI`, `GHL_USER_TYPE`
- `GHL_TOKEN_STORAGE_URL` — server-to-server sink for the exchanged token bundle. Required for tokens to actually persist; if unset, the callback returns `persisted: false` with an explicit operator warning rather than silently dropping the tokens.
- `GHL_WEBHOOK_SIGNING_SECRET`, `GHL_WEBHOOK_FORWARD_URL`, `GHL_ALLOWED_WEBHOOK_EVENTS`

`GHL_OAUTH_REDIRECT_URI` must exactly match `SP_CONFIG.ghl.oauth.redirectUri`; the canonical value is `https://<your-domain>/api/ghl/oauth/callback`. Likewise, `SP_CONFIG.ghl.webhook.targetUrl` should be `https://<your-domain>/api/ghl/webhook`.

Smoke-test the handlers locally without booting Vercel:

```bash
npm run smoke:serverless
```

`npm run check` runs the same smoke tests in addition to static validation.

See [`docs/GHL_SETUP.md`](./docs/GHL_SETUP.md) for the full operator setup guide:

- Creating the Marketplace app and choosing scopes.
- Building the install URL and exchanging the auth code at `https://services.leadconnectorhq.com/oauth/token`.
- Production API call shape (`Authorization: Bearer …`, `Version: 2021-07-28`, base `https://services.leadconnectorhq.com`).
- Webhook receiver requirements (2xx in 10s, signature verification, webhook-id de-duplication, install/uninstall handling).
- Exact `config.js` paths to populate.

A populated example is at [`config.sample.js`](./config.sample.js); a sample inbound webhook payload is at [`samples/ghl-webhook-payload.json`](./samples/ghl-webhook-payload.json).

`npm run check` enforces that the `SP_CONFIG.ghl` schema keys are all present in `config.js`. Production-required values that are still on placeholders (`ghl.locationId`, `ghl.oauth.clientId`, `ghl.oauth.installUrl`, `ghl.oauth.redirectUri`, `ghl.webhook.targetUrl`) are reported as **launch checklist warnings** — they do not fail the build, but the dashboard will display them as `placeholder · required` until resolved.

## Config Builder (operator workflow)

The **Config Builder** section (reachable from the top nav) is a local utility for generating the exact `config.js` block without hand-editing the file.

How to use it:

1. Open the site (`npm run dev`) and click **Builder** in the top nav.
2. Each key in `window.SP_CONFIG` is rendered as a labeled input, pre-filled with the current value from `config.js`. Every field is validated as you type:
   - **placeholder** — empty, `#`, or starts with `REPLACE_`
   - **ready** — a valid `http://` or `https://` URL
   - **invalid** — anything else (wrong protocol, malformed, typo)
3. The readiness summary at the top updates live with the ready / placeholder / invalid counts.
4. Paste the real GHL checkout, Skool, freebie opt-in, analytics, and social bio URLs into each field.
5. The generated `config.js` block at the bottom rewrites itself on every keystroke, preserving the `window.SP_CONFIG = { ... }` format, grouping comments, and trailing commas.
6. Click **Copy config.js**. On modern browsers this uses `navigator.clipboard`; if the browser blocks it (insecure origin, permission denied), a `document.execCommand('copy')` fallback runs. If both fail, tap inside the generated block, select all, and copy manually — the UI will tell you to do this.
7. Open `config.js` in the repo root, replace the entire file contents with what you copied, then commit and push:

   ```bash
   git add config.js
   git commit -m "Wire live GHL / checkout / Skool URLs"
   git push origin main
   ```

8. Vercel (and GitHub Pages, if enabled) will redeploy automatically. Reload the site — the **Launch Links** panel should now show every destination as **ready**.

The Config Builder is static by design: it reads the loaded `window.SP_CONFIG` and generates text. Nothing is written to the browser (no `localStorage`, `sessionStorage`, cookies, or server calls), so if you reload the page before committing you will lose what you typed. Copy the generated block first, then reload.

## GHL Build Sheet (operator workflow)

The **Build Sheet** section (reachable from the top nav) is the operator-facing build plan for GoHighLevel. Use it to translate the funnel strategy into the concrete GHL automations before traffic turns on.

What it contains:

1. **Tag taxonomy** — the exact tag names to create in GHL (`lead-freebie`, `buyer-ebook7`, `buyer-audio17`, `buyer-paperback27`, `buyer-course67`, `skool-trial`, `skool-monthly`, `skool-annual`, `lifetime`, `abandoned-checkout`, `refund-risk`, `refunded`, `testimonial-requested`, `unsubscribed-email`, `sms-opt-out`, `vip`), plus when each is applied and which workflows consume it.
2. **Custom fields** — contact-level fields (`first_purchase_date`, `last_purchase_product`, `ltv_cents`, `freebie_source`, `skool_invite_sent`, `refund_reason`, `nps_score`, `preferred_channel`) to create in `Settings → Custom Fields → Contact`.
3. **Pipeline and stages** — one `Soul Prosperity Ladder` pipeline, with stages mirroring the offer ladder and explicit enter / exit conditions.
4. **Workflow-by-workflow implementation** — cards for each of the eight core workflows (`WF-01` through `WF-08`) covering trigger, entry action, sequence, if/else branches, and exit conditions.
5. **QA checklist** — pre-traffic tests: test contact, opt-in firing, purchase tagging, tag-change exits, delivery email rendering, SMS quiet hours, unsubscribe + STOP compliance, abandoned checkout recovery, Skool invite, human refund path, and pipeline movement.

How to use it:

1. Open the site (`npm run dev`) and click **Build Sheet** in the top nav.
2. Open GHL in a second tab. Walk the sheet top to bottom — start with tags in `Settings → Tags`, then custom fields, then the pipeline, then each workflow in `Automation → Workflows`.
3. Use the **Copy tag list** and **Copy workflow names** buttons to paste the canonical names into GHL so filters and exports stay consistent. The clipboard call uses `navigator.clipboard` with a `document.execCommand('copy')` fallback; if both fail, tap into the textarea and copy manually — the UI will tell you to.
4. After the build, use the **QA before traffic** checklist with a throwaway test contact. Every item should pass before paid traffic is pointed at the funnel.

The Build Sheet is static by design: it is documentation + copyable text blocks + a transient QA checklist. Nothing is written to the browser (no `localStorage`, `sessionStorage`, cookies, or server calls). Reloading the page resets the QA checks — treat it as a walk-through, not a persistence layer.

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
