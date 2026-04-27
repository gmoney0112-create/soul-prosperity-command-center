# GoHighLevel (HighLevel) — Operator Setup Guide

This is the production-readiness guide for wiring the Soul Prosperity
Funnel Command Center to a real HighLevel sub-account. The dashboard
itself is a static site — no backend, no environment variables, no
secrets in `config.js`. Everything below tells you which non-secret
identifiers and URLs to drop into `config.js`, and which secrets to
keep on a backend you (or a serverless function) own.

If you only need to wire links (checkout URLs, Skool URLs, bio link),
that lives in the **Launch Links** and **Config Builder** panels and
is documented in the main `README.md`. This file covers the GHL
production wiring exposed in the **GHL Wiring** panel
(`window.SP_CONFIG.ghl.*`).

---

## 1. Prerequisites

You need:

- A HighLevel **Agency** account (Marketplace apps must be created at
  the agency level).
- One **sub-account (location)** that will run the funnel. Note the
  location ID — you will see it in the URL while inside the
  sub-account, e.g.:
  `https://app.gohighlevel.com/v2/location/<LOCATION_ID>/dashboard`.
- A backend or serverless function that can:
  1. Receive the OAuth `?code=...` redirect from HighLevel.
  2. Exchange the code for an access + refresh token at
     `https://services.leadconnectorhq.com/oauth/token`.
  3. Receive HighLevel webhooks at a public HTTPS URL and verify
     their signature.

  This dashboard does **not** ship that backend. It is a static
  control panel that points operators at the right places. Build the
  backend once (Cloudflare Workers, Vercel Functions, AWS Lambda, a
  Rails endpoint — anything HTTPS) and reference its URLs from
  `config.js`.

---

## 2. Create the Marketplace app (only if you need OAuth)

You only need a Marketplace app if you (or a backend) will call the
HighLevel API on a sub-account's behalf. If all you need is to embed
checkout links and run native GHL workflows, you can skip OAuth and
fill only the operator-entry URLs (`ghl.dashboardUrl`,
`ghl.workflowsUrl`, etc).

### 2.1 Steps

1. Sign in to <https://marketplace.gohighlevel.com> with your agency
   account.
2. **My Apps → Create App.** Choose **Private** (sub-account install
   only) unless you intend to publish publicly.
3. Under **Distribution**:
   - Distribution type: **Sub-Account**.
   - Listing type: keep **Private** while testing.
4. Under **Auth**:
   - Add the **Redirect URL** that your backend will host. Must be
     HTTPS. Example: `https://api.yourdomain.com/ghl/oauth/callback`.
   - Choose the **Scopes** you need. Recommended minimum for the Soul
     Prosperity ladder:

     ```text
     contacts.readonly
     contacts.write
     conversations.readonly
     conversations.write
     conversations/message.write
     opportunities.readonly
     opportunities.write
     workflows.readonly
     locations.readonly
     ```

     Add more only if a workflow needs them. HighLevel rejects calls
     made with scopes you didn't request.
5. Save the app. HighLevel will show a **Client ID** and **Client
   Secret**. The Client ID is public; the Client Secret stays on your
   backend and **must not** appear anywhere in this repo.

### 2.2 Build the install URL

The install URL is what an operator clicks to install your app onto a
sub-account. HighLevel v2 uses the Authorization Code Grant:

```text
https://marketplace.gohighlevel.com/oauth/chooselocation
  ?response_type=code
  &redirect_uri=<URL-encoded redirect_uri>
  &client_id=<your client_id>
  &scope=<space-separated scopes>
```

URL-encode `redirect_uri` and `scope`. Paste the full URL into
`config.js` at `SP_CONFIG.ghl.oauth.installUrl`. The dashboard's
"Install GHL app" link will use it directly.

### 2.3 Token exchange (server-side only)

On the redirect, HighLevel calls your `redirect_uri` with a `?code=`
query parameter. Your backend exchanges it:

```http
POST https://services.leadconnectorhq.com/oauth/token
Content-Type: application/x-www-form-urlencoded

client_id=<client_id>&
client_secret=<client_secret>&
grant_type=authorization_code&
code=<code>&
user_type=Location&
redirect_uri=<redirect_uri>
```

HighLevel returns:

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "expires_in": 86399,
  "scope": "...",
  "locationId": "...",
  "userId": "...",
  "companyId": "..."
}
```

Store the `access_token`, `refresh_token`, `expires_in`, and
`locationId` in your backend's secret store. Refresh before expiry
using `grant_type=refresh_token`.

The static dashboard never sees these tokens.

---

## 3. API call shape (v2)

When your backend calls HighLevel:

- **Base URL:** `https://services.leadconnectorhq.com`
- **Auth header:** `Authorization: Bearer <access_token>`
- **Version header:** `Version: 2021-07-28` (required on v2 calls)
- **Content type:** `application/json` for write calls

Example — upsert a contact (preferred over the deprecated plain "Get
Contacts" list):

```http
POST https://services.leadconnectorhq.com/contacts/upsert
Authorization: Bearer <access_token>
Version: 2021-07-28
Content-Type: application/json

{
  "locationId": "<LOCATION_ID>",
  "email": "buyer@example.com",
  "firstName": "Soul",
  "lastName": "Prosperity",
  "tags": ["lead-freebie"],
  "customFields": [
    { "key": "freebie_source", "value": "instagram-reel" }
  ]
}
```

For lookups, prefer **`POST /contacts/search`** with a query body
over **`GET /contacts/`** — the latter is deprecated and rate-limited
more aggressively.

---

## 4. Webhooks

### 4.1 Where to configure

Marketplace app → **Advanced Settings → Webhooks**. HighLevel does
**not** subscribe to webhooks via API; the operator configures them in
the Marketplace UI per app.

### 4.2 Endpoint requirements

- HTTPS only.
- Must respond `2xx` within ~10 seconds. Do real work asynchronously
  (queue + ack).
- Must verify the webhook signature header (HighLevel signs each
  webhook). Reject any payload whose signature does not match.
- Must de-duplicate using the webhook id (HighLevel can retry on
  network errors, leading to duplicate deliveries).

### 4.3 Recommended subscribed events

```text
ContactCreate
ContactUpdate
ContactTagUpdate
OpportunityCreate
OpportunityStatusUpdate
InboundMessage
OutboundMessage
OrderCreate
AppInstall
AppUninstall
```

`AppInstall` / `AppUninstall` are critical: on install you receive a
location-scoped token bundle; on uninstall you must revoke local
state.

### 4.4 Signature verification (sketch)

```js
const crypto = require("crypto");

function verifyHighLevelSignature(rawBody, signatureHeader, secret) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  // Use timing-safe compare; reject on length mismatch.
  if (signatureHeader.length !== expected.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(signatureHeader),
    Buffer.from(expected)
  );
}
```

The exact signing secret + header name are issued by HighLevel when
you save the webhook; keep them in your backend secret store, never
in `config.js`.

A sample inbound webhook payload is at
`samples/ghl-webhook-payload.json`.

---

## 5. Populating `config.js`

Open `config.js` and replace each `REPLACE_*` / `#` value under
`window.SP_CONFIG.ghl`:

| Path | What to put |
| --- | --- |
| `ghl.locationId` | Sub-account ID from the GHL URL |
| `ghl.dashboardUrl` | `https://app.gohighlevel.com/v2/location/<id>/dashboard` |
| `ghl.workflowsUrl` | `https://app.gohighlevel.com/v2/location/<id>/automation/workflows` |
| `ghl.campaignsUrl` | `https://app.gohighlevel.com/v2/location/<id>/marketing/campaigns` |
| `ghl.contactsUrl` | `https://app.gohighlevel.com/v2/location/<id>/contacts/smart_list/All` |
| `ghl.opportunitiesUrl` | Pipeline board URL for "Soul Prosperity Ladder" |
| `ghl.conversationsUrl` | `https://app.gohighlevel.com/v2/location/<id>/conversations/conversations` |
| `ghl.analyticsUrl` | Reporting → Dashboard URL |
| `ghl.calendarBookingUrl` | Public booking page URL |
| `ghl.oauth.clientId` | Public Marketplace client_id |
| `ghl.oauth.installUrl` | Full chooselocation URL (section 2.2) |
| `ghl.oauth.redirectUri` | Your backend's HTTPS redirect URL |
| `ghl.oauth.scopes` | Space-separated scope list — leave the default unless adding scopes |
| `ghl.webhook.targetUrl` | Your backend's public HTTPS webhook receiver |

The `ghl.api.*` block is HighLevel's fixed v2 endpoints — leave it as
shipped unless HighLevel publishes a new base.

A populated example is at `config.sample.js`.

After saving `config.js`:

```bash
npm run check          # validates schema; reports launch warnings
npm run dev            # opens http://127.0.0.1:3000
```

The **GHL Wiring** panel will turn each row from `placeholder` /
`placeholder · required` to `ready` as you fill values in.

---

## 6. What stays out of this repo

These values are **secrets**. They never go in `config.js`, never go
in this repo, and never reach the browser:

- OAuth `client_secret`
- Per-location `access_token` and `refresh_token`
- Webhook signing secret
- Any agency-level API key

Store them in:

- Your backend's secret manager (AWS Secrets Manager, Vercel
  Encrypted Env Vars, Cloudflare Secrets, etc.).
- A short-lived in-memory cache when calling HighLevel.

If a secret is ever committed by accident, rotate it in HighLevel
**immediately** — Marketplace app settings let you regenerate the
client secret, and `AppUninstall` + reinstall rotates location
tokens.

---

## 7. Production readiness checklist

Run `npm run check` — it will print `Launch checklist warnings` for
every required GHL value still on a placeholder. Resolve each before
pointing paid traffic at the funnel.

In addition:

- [ ] Marketplace app created; client_id captured; client_secret
      stored on backend only.
- [ ] Redirect URI registered in Marketplace app and reachable at
      HTTPS.
- [ ] OAuth round-trip tested end-to-end with a throwaway sub-account.
- [ ] Webhook receiver responds 2xx in <2s on average.
- [ ] Webhook signature verification active; signature mismatches
      logged and rejected.
- [ ] Webhook id de-duplication active (rolling 24h cache is fine).
- [ ] `ContactUpdate` and `OpportunityStatusUpdate` confirmed firing
      against the test contact from the **Build Sheet → QA before
      traffic** section.
- [ ] `AppInstall` and `AppUninstall` handlers exist; uninstall
      revokes local token state.
- [ ] All eight `WF-01..WF-08` workflows built per the Build Sheet,
      QA'd with a real test contact.
- [ ] All `ghl.*` rows in the dashboard's GHL Wiring panel show
      `ready`.

When the checklist is green and the panel shows zero `Required
missing`, the dashboard is production-wired.
