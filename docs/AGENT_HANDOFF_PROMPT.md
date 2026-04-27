# Agent Handoff Prompts

Use this document when you want to hand the rest of the launch off
from one AI assistant (e.g. Comet) to another. It contains
ready-to-paste prompts for the three agent classes that can finish
the job, plus a recommendation on which to use for which slice.

---

## TL;DR — recommended split

The remaining work is in three layers, and the most compatible agent
for each is different:

| Layer | Best agent | Why |
| --- | --- | --- |
| Repo / code / env-doc changes (this dashboard, the serverless layer, CI, env templates) | **Claude Code** | Has direct file-edit, repo, and shell tools; understands Node/Vercel; was used to build the layer; can run `npm run check` end-to-end. |
| GHL Marketplace UI setup (creating the app, registering scopes, configuring webhooks, building workflows) | **Manus** *or* a browser-automation operator (Comet, browser-use, Playwright agent) | These are point-and-click steps in a third-party UI behind a real login. A code-only agent cannot do them. |
| Provisioning secrets and payment surfaces (Stripe Connect, GHL `client_secret`, Skool, ad accounts) | **You / a human operator** | Secrets must be entered by a person with account access; no agent should ever see `client_secret` in plaintext. |

If you have to pick *one* agent, **pick Claude Code** for everything
in the repo and human-do the rest. Manus / a browser agent is the
right complement when the operator wants the GHL setup driven for
them too.

---

## 1. Prompt — Claude Code (repo + env + verification)

Copy this verbatim into a fresh Claude Code session at the repo root.

```text
You are taking over the Soul Prosperity Command Center handoff from
the previous agent. Repo: gmoney0112-create/soul-prosperity-command-center.
Live URL: https://soul-prosperity-command-center.vercel.app.

Current state (verify before changing anything):
- Static dashboard live on Vercel.
- Serverless GHL layer under /api/ghl/* (health, oauth/callback,
  webhook). Webhook verification uses HighLevel's published public
  keys (Ed25519 + RSA) baked into api/_lib/ghl.js. There is
  intentionally NO GHL_WEBHOOK_SIGNING_SECRET.
- Vercel env vars (GHL_CLIENT_ID, GHL_CLIENT_SECRET,
  GHL_OAUTH_REDIRECT_URI, GHL_TOKEN_STORAGE_URL) are unset, so
  /api/ghl/health currently reports ready.oauth=false.
- config.js still has placeholders for ghl.locationId,
  ghl.oauth.clientId, ghl.oauth.installUrl, ghl.oauth.redirectUri,
  ghl.webhook.targetUrl.

Read these in order before doing anything else:
  - docs/PRODUCTION_HANDOFF.md
  - docs/GHL_SETUP.md
  - .env.example
  - README.md
  - scripts/smoke-serverless.js
  - api/_lib/ghl.js, api/ghl/webhook.js, api/ghl/oauth/callback.js,
    api/ghl/health.js

Then do the following — but ONLY what is in the repo's scope. Do not
attempt anything that requires logging into GHL, Stripe, Vercel,
Skool, or any ad platform. Those are operator-owned (see
docs/AGENT_HANDOFF_PROMPT.md §3).

Tasks:
  1. Run `npm install && npm run check`. Confirm it passes with the
     expected launch warnings (placeholders + unset server env). If
     it fails for any other reason, fix it.
  2. If the operator has provided a populated config.js block (e.g.
     pasted into the conversation), apply it: replace config.js with
     it, run `npm run check`, ensure no `placeholder · required` are
     left, commit, and push.
  3. If the operator has provided real values for the Vercel env
     vars (GHL_CLIENT_ID, GHL_OAUTH_REDIRECT_URI, etc.) and asks you
     to set them, refuse — ask them to set them in the Vercel
     dashboard themselves. You are not authorized to handle the
     client_secret.
  4. If anything in api/_lib/ghl.js, api/ghl/webhook.js, or
     scripts/smoke-serverless.js needs further hardening to stay in
     sync with HighLevel's published webhook signature schemes, make
     the change with full smoke-test coverage and a commit.
  5. After every change run `npm run check` and report the result.
  6. NEVER commit secrets. NEVER write to localStorage / sessionStorage
     / cookies. NEVER add a GHL_WEBHOOK_SIGNING_SECRET env var.

When done, post a summary with: files changed, tests run, remaining
operator-owned blockers (refer to docs/PRODUCTION_HANDOFF.md §3),
and whether the dashboard's GHL Wiring panel is fully green.
```

---

## 2. Prompt — Manus / browser-automation agent (GHL UI setup)

Copy this for an agent that can drive a real browser session inside
the operator's GHL agency account.

```text
You are completing the GoHighLevel Marketplace setup for the Soul
Prosperity Command Center. The dashboard and serverless backend are
already live at https://soul-prosperity-command-center.vercel.app.
Reference doc: docs/PRODUCTION_HANDOFF.md and docs/GHL_SETUP.md
in the repo.

You are operating inside the operator's HighLevel **Agency** account
(they have already signed in for you). Your job is everything that
must be done in the GHL UI — nothing else.

Steps:
  1. Capture the **sub-account location ID** — open the sub-account
     that will run the funnel, copy the segment after `/v2/location/`
     in the URL. Save this for the operator.
  2. Open https://marketplace.gohighlevel.com → My Apps → Create App.
     - Type: Private.
     - Distribution: Sub-Account.
     - Listing: Private.
  3. Auth tab:
     - Redirect URL:
       `https://soul-prosperity-command-center.vercel.app/api/ghl/oauth/callback`
     - Scopes (minimum):
         contacts.readonly, contacts.write,
         conversations.readonly, conversations.write,
         conversations/message.write,
         opportunities.readonly, opportunities.write,
         workflows.readonly, locations.readonly
  4. Save the app. Capture the `client_id` (public) and let the
     operator capture the `client_secret` themselves — do NOT record
     or transmit `client_secret` anywhere.
  5. Build the install URL using the format in
     docs/GHL_SETUP.md §2.2; URL-encode redirect_uri and the
     space-separated scope list. Save this URL for the operator to
     paste into config.js (`ghl.oauth.installUrl`).
  6. Webhooks tab:
     - Endpoint: `https://soul-prosperity-command-center.vercel.app/api/ghl/webhook`
     - Subscribed events: ContactCreate, ContactUpdate,
       ContactTagUpdate, OpportunityCreate, OpportunityStatusUpdate,
       InboundMessage, OutboundMessage, OrderCreate, AppInstall,
       AppUninstall.
     - Save. Click "Send test event" once and report the response
       (the operator can verify a 200 in Vercel function logs).
  7. (Optional, if the operator asks) Build the WF-01..WF-08 workflows
     per the dashboard's Build Sheet section. Each workflow's trigger,
     entry action, sequence, branches, and exit conditions are spelled
     out card-by-card on that page.

NEVER:
  - Touch the operator's `client_secret` outside the field that
    HighLevel itself shows it in.
  - Modify any file in the repo.
  - Set Vercel env vars.

When done, report: location_id, client_id (public), install URL,
list of registered scopes, list of subscribed webhook events,
status of the test webhook delivery.
```

---

## 3. Prompt — generic browser/operator agent (Vercel + Stripe + sinks)

Copy this for an agent that can drive a logged-in browser session
across Vercel, Stripe, and whatever you pick as a token-storage sink.

```text
You are wiring the operator-owned production secrets for the Soul
Prosperity Command Center. The repo, dashboard, and serverless layer
are already deployed. Reference: docs/PRODUCTION_HANDOFF.md §3.

You are working inside accounts the operator has already signed
into (Vercel, Stripe, the chosen token-storage provider, the chosen
webhook-forward sink). Your job is to:

  1. **Provision the token storage sink.** The simplest option is
     a new Vercel project route that writes to `@vercel/kv`, but a
     Make / Zapier webhook into Google Sheets is acceptable as a
     placeholder. Capture the resulting HTTPS URL.

  2. **Set Vercel env vars** on the
     `soul-prosperity-command-center` project, Production scope:
       - GHL_CLIENT_ID         = <from the Marketplace app>
       - GHL_CLIENT_SECRET     = <from the Marketplace app — paste,
                                 do NOT print, do NOT log>
       - GHL_OAUTH_REDIRECT_URI = https://soul-prosperity-command-center.vercel.app/api/ghl/oauth/callback
       - GHL_USER_TYPE         = Location
       - GHL_TOKEN_STORAGE_URL = <the sink URL from step 1>
       - GHL_WEBHOOK_FORWARD_URL = (optional) <forward sink URL>
     Trigger a redeploy after saving.

  3. **Verify health** — once the redeploy finishes, GET
     https://soul-prosperity-command-center.vercel.app/api/ghl/health
     and confirm:
       ready.oauth   == true
       ready.webhook == true
     If either is false, stop and report the JSON response.

  4. **Run a real install** — open the Marketplace app's install
     URL (operator will provide), pick the throwaway sub-account,
     and confirm the callback returns
     `{ ok: true, installed: true, persisted: true }`. Confirm the
     token bundle landed in your sink.

  5. **Stripe** — connect the Stripe account to the GHL sub-account
     and create the eight ladder products at the prices listed in
     README.md §"What this is".

NEVER:
  - Print, log, screenshot, or paste `GHL_CLIENT_SECRET` anywhere.
  - Commit any value to the repo.
  - Run `git push` from a session that has the secret in env.

When done, report the redacted env names that were set, the
returned `/api/ghl/health` JSON, and the result of the test
install.
```

---

## 4. What none of these agents should do

- Approve or merge pull requests.
- Touch GitHub repo settings (collaborators, secrets, branch
  protection).
- Run destructive git commands (`reset --hard`, `push --force`).
- Commit anything to `main` without the operator's explicit per-PR
  approval.
- Add a `GHL_WEBHOOK_SIGNING_SECRET` env var. HighLevel does not
  use HMAC for webhook signing — it uses public-key crypto and the
  public keys are already baked into `api/_lib/ghl.js`.

---

## 5. Recommendation, in one sentence

**Hand the repo, env-doc, and verification work to Claude Code; hand
the GHL Marketplace UI setup to Manus or a browser-automation agent
the operator trusts; keep secrets and payment surfaces (Stripe
Connect, GHL `client_secret`, Vercel env entry) on a human
operator.** That split matches each agent class to the surface it can
actually act on without breaking the security boundary.
