# Production Handoff — Soul Prosperity Command Center

This is the end-to-end handoff document for taking the Soul Prosperity
Funnel Command Center from its current state (live static dashboard +
serverless GHL layer, env vars unset) to "running paid traffic into
the funnel." Read this top to bottom before touching anything.

---

## 1. Current state (as of this handoff)

### 1.1 Live URLs

| Surface | URL |
| --- | --- |
| Production dashboard (Vercel alias) | https://soul-prosperity-command-center.vercel.app |
| Launch blueprint (full plan) | https://soul-prosperity-command-center.vercel.app/source-assets/launch-blueprint.html |
| Paid traffic plan | https://soul-prosperity-command-center.vercel.app/source-assets/paid-traffic-plan.html |
| GHL setup guide | https://soul-prosperity-command-center.vercel.app/docs/GHL_SETUP.md |
| Launch blueprint (markdown) | https://soul-prosperity-command-center.vercel.app/docs/LAUNCH_BLUEPRINT.md |
| Health probe | https://soul-prosperity-command-center.vercel.app/api/ghl/health |
| OAuth callback | https://soul-prosperity-command-center.vercel.app/api/ghl/oauth/callback |
| Webhook receiver | https://soul-prosperity-command-center.vercel.app/api/ghl/webhook |

### 1.2 Repo

- GitHub: `gmoney0112-create/soul-prosperity-command-center`
- Default branch: `main`
- Recent commits include the launch blueprint, GHL serverless layer,
  Vercel deployment, and hardened CI.

### 1.3 What is wired vs. what is not

| Component | Wired? | Notes |
| --- | --- | --- |
| Static dashboard | ✅ | Renders as-is |
| Launch blueprint and source-assets | ✅ | All 200s confirmed |
| `/api/ghl/health` endpoint | ✅ | Returns `ok:true` |
| `/api/ghl/oauth/callback` endpoint | ⚠️ | Code path correct; env unset |
| `/api/ghl/webhook` endpoint | ⚠️ | Verification baked in; env unset for forwarding |
| Vercel env vars (`GHL_*`) | ❌ | All unset → `ready.oauth=false` in health |
| GHL Marketplace app | ❌ | Operator must create |
| Token storage sink | ❌ | Operator must build / pick |
| Webhook forward sink (optional) | ❌ | Operator may add later |
| `config.js` GHL fields | ❌ | All placeholders |
| Stripe / GHL workflows / pixels / Skool | ❌ | Operator-owned |

---

## 2. Architecture

```
                ┌────────────────────────────────────────┐
                │  Static dashboard (index.html, app.js, │
                │  styles.css, config.js, source-assets/)│
                │  Hosted by Vercel + GitHub Pages.      │
                │  No secrets, no backend calls.         │
                └────────────────────────────────────────┘
                                  │
                                  ▼  (operator entry URLs in config.js)
                         GHL UI (sub-account console)

  HighLevel Marketplace ───install───► /api/ghl/oauth/callback
                                            │
                                            │ token bundle JSON
                                            ▼
                                     GHL_TOKEN_STORAGE_URL
                                  (operator-owned, server-side)

  HighLevel webhook deliveries ───────► /api/ghl/webhook
                                            │
                                  ed25519/rsa verify (built-in keys)
                                  dedupe / allowlist / forward
                                            │
                                            ▼
                                   GHL_WEBHOOK_FORWARD_URL
                                       (optional sink)
```

Pieces:

- **Static dashboard** — `index.html`, `styles.css`, `app.js`,
  `config.js`, plus the `source-assets/` HTML set. Pure static; no
  backend; no `localStorage`/`sessionStorage` (CI enforces this).
- **Launch blueprint assets** — operator-facing guides under
  `source-assets/` and `docs/`. CI fails if any required asset is
  missing.
- **Vercel serverless GHL routes** — `/api/ghl/health`,
  `/api/ghl/oauth/callback`, `/api/ghl/webhook`. Run on Vercel's Node
  runtime, no build step.
- **GitHub CI** — `.github/workflows/ci.yml` runs `npm run check`
  (syntax + validator + smoke tests) on every push/PR.
- **GitHub Pages** — `.github/workflows/pages.yml` mirrors the static
  site on Pages (private-repo plans may skip this; Vercel is primary).
- **Vercel production alias** —
  `soul-prosperity-command-center.vercel.app`.

---

## 3. Remaining account-owned tasks

These are the things that **only the account owner / operator can do**.
Each row is a discrete blocker; complete every one.

### 3.1 GoHighLevel Marketplace app

| Value | Where to get it |
| --- | --- |
| **Sub-account location ID** | While inside the sub-account, copy the segment after `/v2/location/` in the URL: `app.gohighlevel.com/v2/location/<LOCATION_ID>/dashboard`. |
| **Marketplace client_id** | Sign in to <https://marketplace.gohighlevel.com> with your **Agency** account → My Apps → Create App (Private, Sub-Account distribution). After saving the app, the client_id is shown on the app's Auth page. Public — safe in `config.js`. |
| **Marketplace client_secret** | Same Auth page as above. **Secret** — only goes in Vercel env vars (`GHL_CLIENT_SECRET`). Rotate immediately if it ever appears in a commit. |
| **Install URL** | Build the v2 chooselocation URL per `docs/GHL_SETUP.md` §2.2. Format: `https://marketplace.gohighlevel.com/oauth/chooselocation?response_type=code&redirect_uri=<url-encoded>&client_id=<id>&scope=<space-separated>`. |
| **Redirect URI** | Use exactly: `https://soul-prosperity-command-center.vercel.app/api/ghl/oauth/callback`. Register this in the Marketplace app's Auth page **and** set it as `GHL_OAUTH_REDIRECT_URI` in Vercel. They must match byte-for-byte. |

### 3.2 Vercel project env vars

Open the Vercel project → Settings → Environment Variables. Set the
following for **Production** (and Preview if you want PR deploys to
work too). All values are server-only — never reflected to the browser.

| Variable | Value source | Required? |
| --- | --- | --- |
| `GHL_CLIENT_ID` | Marketplace app Auth page | **Required** |
| `GHL_CLIENT_SECRET` | Marketplace app Auth page | **Required** |
| `GHL_OAUTH_REDIRECT_URI` | `https://soul-prosperity-command-center.vercel.app/api/ghl/oauth/callback` | **Required** |
| `GHL_USER_TYPE` | `Location` (default; use `Company` only for agency-scoped apps) | Optional |
| `GHL_TOKEN_STORAGE_URL` | Your token sink (see 3.3) | **Required** for tokens to persist |
| `GHL_WEBHOOK_FORWARD_URL` | Your webhook sink (see 3.4) | Optional |
| `GHL_ALLOWED_WEBHOOK_EVENTS` | Leave unset for the default allowlist | Optional |

> **There is intentionally no `GHL_WEBHOOK_SIGNING_SECRET`.** HighLevel
> signs webhooks with public-key crypto (Ed25519 / RSA-SHA256); the
> public keys are baked into `api/_lib/ghl.js`. Verification works
> without env config.

### 3.3 Token storage sink (`GHL_TOKEN_STORAGE_URL`)

After token exchange, the OAuth callback POSTs the token bundle as
JSON to this URL. Pick any of:

- **Vercel KV ingest** — write a tiny `/api/tokens/store` route in this
  same project that writes to `@vercel/kv`.
- **Upstash Redis** — Upstash exposes a REST URL you can POST to
  directly (use a per-record key under the location id).
- **Your own DB** — any HTTPS endpoint with auth that writes a row.
- **A Make/Zapier webhook** — fastest path to get *something* writing
  to a Google Sheet / Airtable while you build the real sink.

Whatever you pick, it must:

- Be HTTPS.
- Accept a JSON POST.
- Authenticate the caller (e.g. with a shared header you also set as a
  Vercel secret, then add a header check in `api/ghl/oauth/callback.js`
  if you go that route).
- Persist `access_token`, `refresh_token`, `expires_in`, `locationId`,
  `companyId`, `scope`.

If unset, `/api/ghl/oauth/callback` will return `persisted: false`
with an explicit operator warning. Tokens are not silently dropped, but
they are not stored either — installs will appear successful but no
API calls will be possible.

### 3.4 Webhook forwarding sink (`GHL_WEBHOOK_FORWARD_URL`) — optional

If set, every accepted (verified, de-duped, allowlisted) webhook is
forwarded as JSON to this URL. Use this to fan out into a queue, KV,
or your own pipeline. If unset, the webhook handler logs sanitized
metadata and ack's HighLevel anyway — no events are lost in transit,
but they are not durably persisted unless you point this at storage.

### 3.5 Stripe / GHL workflows / pixels / Skool / email auth

Out of scope for this code repo, but blocking for traffic. Per the
Build Sheet section of the dashboard:

- **Stripe** — connect to GHL sub-account; create the eight ladder
  products at $7 / $17 / $27 / $67 / $47/mo / $247/yr / $497.
- **GHL workflows** — build `WF-01..WF-08` per the Build Sheet.
- **Pixels** — Meta Pixel + GA4 + TikTok Pixel on the public funnel
  pages (sales pages live under `source-assets/`).
- **Skool** — create the community, set monthly / annual / lifetime
  tiers, capture invite URLs into `config.js`.
- **Email auth** — domain SPF/DKIM/DMARC configured before any
  outbound email; otherwise the WF-01 freebie email will deliver to
  spam.

---

## 4. Step-by-step execution checklist

Do them in this order. Each step has a verifier you can run before
moving on.

1. **Create the GHL Marketplace app** (3.1). Capture `client_id`,
   `client_secret`, register the redirect URI.
2. **Provision the token storage sink** (3.3). Note its HTTPS URL.
3. **Set Vercel env vars** (3.2). Trigger a redeploy (push a commit or
   click "Redeploy" in Vercel) so the new env values are picked up by
   the running functions.
4. **Verify health**:
   ```bash
   curl -s https://soul-prosperity-command-center.vercel.app/api/ghl/health | jq
   ```
   Expect `ready.oauth: true`, `ready.webhook: true`.
5. **Run a real install** from the Marketplace app's install URL
   against a throwaway sub-account. Confirm the callback responds
   `installed: true, persisted: true` and your sink received the
   token bundle.
6. **Configure the webhook in the Marketplace app** (Advanced Settings
   → Webhooks). Endpoint: `https://soul-prosperity-command-center.vercel.app/api/ghl/webhook`.
   Subscribe to the events in `docs/GHL_SETUP.md` §4.3. Click "Send
   test event"; expect 200 in your function logs.
7. **(Optional)** Set `GHL_WEBHOOK_FORWARD_URL` (3.4) and confirm a
   second test event appears in your sink.
8. **Populate `config.js`** — fill every `ghl.*` field per the table
   in `docs/GHL_SETUP.md` §5. Use the dashboard's Config Builder to
   generate the block. Commit, push, redeploy.
9. **Verify the dashboard's GHL Wiring panel** shows every row as
   `ready` (no `placeholder · required`).
10. **Build the eight workflows** and run the Build Sheet QA against
    a test contact end-to-end.
11. **Pixel + ad accounts** wired per the paid traffic plan.
12. **Run ads.**

---

## 5. Testing & verification commands

### 5.1 Local

```bash
npm install
npm run check        # static validation + smoke tests
npm run smoke:serverless  # smoke tests only
npm run dev          # serves the dashboard at http://127.0.0.1:3000
```

Expected: `Validation passed` and `ALL SMOKE TESTS PASSED`.

### 5.2 Production (Vercel)

```bash
# Health probe — should report ready.webhook: true once deployed,
# ready.oauth: true once env vars are set.
curl -s https://soul-prosperity-command-center.vercel.app/api/ghl/health | jq

# OAuth path — without ?code, expect 400 missing_code.
curl -s "https://soul-prosperity-command-center.vercel.app/api/ghl/oauth/callback" | jq

# Webhook signature path — without a real HighLevel signature,
# expect 401 invalid_signature with reason=no_signature_header.
curl -s -X POST https://soul-prosperity-command-center.vercel.app/api/ghl/webhook \
  -H "Content-Type: application/json" \
  -d '{"type":"ContactCreate"}' | jq
```

### 5.3 Static asset reachability

```bash
for path in / \
  /source-assets/launch-blueprint.html \
  /source-assets/paid-traffic-plan.html \
  /docs/GHL_SETUP.md \
  /docs/LAUNCH_BLUEPRINT.md \
  /api/ghl/health; do
  printf '%-60s ' "$path"
  curl -o /dev/null -s -w "%{http_code}\n" \
    "https://soul-prosperity-command-center.vercel.app$path"
done
```

Expect every line `200`.

### 5.4 Health target state once env is configured

```json
{
  "ok": true,
  "service": "soul-prosperity-ghl",
  "ready": { "oauth": true, "webhook": true },
  "config": {
    "oauth": {
      "clientId": true,
      "clientSecret": true,
      "redirectUri": true,
      "userType": "Location",
      "tokenStorageConfigured": true
    },
    "webhook": {
      "signatureVerification": true,
      "signatureSchemes": ["ed25519", "rsa-sha256"],
      "forwardConfigured": true,
      "allowedEvents": ["ContactCreate", "..."]
    }
  }
}
```

---

## 6. Rollback plan

The serverless layer is purely additive — turning it off does not
break the static dashboard.

1. **Disable the OAuth callback** — In Vercel, unset
   `GHL_CLIENT_SECRET`. The callback returns `500 server_not_configured`
   on every hit; HighLevel installs fail safely with a clear error.
2. **Disable webhook acceptance** — In the GHL Marketplace app,
   pause / delete the webhook configuration. Existing deliveries stop
   immediately. The endpoint still 401s any unsigned request.
3. **Roll back code** — `git revert <commit>` the offending commit
   and push. Vercel auto-redeploys. The static site is unaffected.
4. **Rotate secrets** — If `GHL_CLIENT_SECRET` is ever exposed,
   regenerate it in the Marketplace app's Auth page; update the
   Vercel env var; redeploy. All previously-issued tokens remain
   valid until they expire — rotate them too via reinstall.

---

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Health says `ready.oauth: false` | One or more of `GHL_CLIENT_ID`, `GHL_CLIENT_SECRET`, `GHL_OAUTH_REDIRECT_URI` is unset or placeholder | Set them in Vercel → redeploy |
| Health says `ready.webhook: false` | Should never happen — public keys are baked into the repo. Check the deployment built without errors. | Inspect Vercel function logs for require-time crash in `api/_lib/ghl.js` |
| OAuth callback returns `502 token_exchange_rejected` | `client_id` / `client_secret` mismatch with Marketplace, or `redirect_uri` differs from what's registered | Verify all three exactly match the Marketplace Auth page |
| OAuth callback returns `200 persisted: false` | `GHL_TOKEN_STORAGE_URL` not configured | Set it in Vercel and reinstall |
| OAuth callback returns `502 token_persistence_failed` | Sink URL set but rejected the POST | Inspect sink logs; verify auth headers; retry install |
| Webhook returns `401 invalid_signature reason=no_signature_header` | Caller did not include `X-GHL-Signature` (or legacy `X-WH-Signature`) | Confirm HighLevel is calling the right URL — the GHL UI test sender includes the signature automatically |
| Webhook returns `401 invalid_signature reason=invalid` | Body was modified in transit, or signature header was generated with the wrong key | Don't pre-parse JSON before verification; check that you're not behind a proxy that re-encodes the body |
| Webhook returns `200 ignored: true` | Event type not in the allowlist | Add to `GHL_ALLOWED_WEBHOOK_EVENTS` or remove the env var to use the default list |
| Webhook returns `200 duplicate: true` | Same `webhook id` was seen recently | Expected during HighLevel retries — no action |
| Dashboard GHL Wiring shows `placeholder · required` | `config.js` value still on `#` or `REPLACE_*` | Update via Config Builder; commit; push; redeploy |
| `npm run check` warns about unset server env in CI | CI runs without GHL env set (intentional) | Warnings only — do not fail the build |

---

## 8. Security boundaries

These are non-negotiable:

- **No secrets in `config.js`.** Everything in `window.SP_CONFIG` is
  visible to anyone with `view-source`. Only public identifiers go
  there. CI does not enforce this — it relies on this discipline.
- **No tokens to the browser.** `/api/ghl/oauth/callback` exchanges
  the auth code server-side and forwards the token bundle to a
  server-to-server sink; the browser response contains booleans and
  identifiers (location id, scope, expires_in) only. Tested in
  `scripts/smoke-serverless.js` (`oauth: success without storage URL
  returns persisted=false` and `success with storage URL forwards
  bundle`).
- **Token storage is mandatory before live installs.** Without a
  storage sink, tokens are not persisted — the install will appear
  successful but no API calls will work. The OAuth callback
  surfaces this explicitly (`persisted: false` + warning).
- **Webhook verification is built-in.** HighLevel signs every
  delivery with public-key crypto; verification uses the published
  Ed25519 and RSA public keys baked into `api/_lib/ghl.js`. The
  endpoint rejects any unsigned or improperly-signed request with
  `401 invalid_signature` before any forwarding or logging of payload
  bodies.
- **Logging redacts secrets.** The shared `sanitizeForLog` strips any
  field whose key matches `/token|secret|authorization|password|api[_-]?key/i`
  before logging. Smoke tests assert that `client_secret` and the
  storage URL never appear in HTTP responses.
- **No browser storage.** `validate.js` fails the build if `app.js` or
  `config.js` use `localStorage`, `sessionStorage`, `indexedDB`, or
  `document.cookie`. Same check covers serverless files (no confused-
  deputy code).

---

## 9. Reference

- `README.md` — repo overview, dashboard usage, Config Builder.
- `docs/GHL_SETUP.md` — full operator setup guide for the Marketplace
  app, OAuth flow, API call shape, and webhook receiver.
- `docs/LAUNCH_BLUEPRINT.md` — funnel-level launch plan.
- `docs/AGENT_HANDOFF_PROMPT.md` — ready-to-paste prompts for handing
  this work off to another AI agent (Claude / Manus / browser).
- `.env.example` — full server-env reference with the rationale for
  every variable.
- `scripts/validate.js` — static validator (run via `npm run check`).
- `scripts/smoke-serverless.js` — in-process tests for the three
  serverless routes, including Ed25519 and RSA signature paths.
