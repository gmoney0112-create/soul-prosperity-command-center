# Browser Agent Handoff — GHL Workflow Setup
## Soul Prosperity Command Center

**Compatible with:** Comet, Claude + Google Chrome extension, browser-use, Manus, Playwright agent

**Date generated:** 2026-06-27  
**Repo:** `gmoney0112-create/soul-prosperity-command-center`  
**Live dashboard:** `https://soul-prosperity-command-center.vercel.app`  
**GHL sub-account:** `https://app.gohighlevel.com/v2/location/ucphPUkSafuQF0ZCZh1T/dashboard`

---

## Current State (read before doing anything)

| Item | Status |
|---|---|
| Dashboard deployed to Vercel | ✅ live |
| All checkout URLs wired | ✅ |
| Skool links wired | ✅ |
| GHL location ID wired | ✅ `ucphPUkSafuQF0ZCZh1T` |
| GHL operator shortcut URLs wired | ✅ |
| GHL PIT key added to Vercel | ✅ (rotated — do not ask for it) |
| GHL Marketplace OAuth app | ⏳ not yet created |
| Vercel KV token storage | ⏳ not yet connected |
| Freebie opt-in URL | ⏳ pending |
| Public booking/calendar URL | ⏳ pending |
| GHL tags created | ⏳ your job |
| GHL custom fields created | ⏳ your job |
| GHL pipeline created | ⏳ your job |
| GHL workflows WF-01..WF-08 built | ⏳ your job |

---

## Security Rules (never break these)

- **Never** record, screenshot, copy, or transmit `GHL_CLIENT_SECRET`, `GHL_PIT_KEY`, access tokens, or refresh tokens
- **Never** commit any value to the repo
- **Never** add a `GHL_WEBHOOK_SIGNING_SECRET` env var — GHL uses public-key crypto, not HMAC
- **Never** write tokens, credentials, or secrets to browser storage (localStorage, sessionStorage, cookies)
- If you encounter a field labeled "Client Secret" in GHL — let the operator fill it manually

---

## Part 1 — Vercel KV Token Storage (5 min)

The OAuth callback is live but tokens have nowhere to persist. Fix this first.

1. Open `https://vercel.com/gmoney0112-creates-projects/soul-prosperity-command-center/stores`
2. Click **Connect Store** → **Create new** → **KV (Upstash)**
3. Name it `soul-prosperity-kv` → **Create & Connect**
4. Vercel auto-injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` into the project and triggers a redeploy
5. Wait for redeploy, then verify:
   ```
   GET https://soul-prosperity-command-center.vercel.app/api/ghl/health
   ```
   Confirm: `ready.oauth = true`, `tokenStorageBackend = "vercel-kv"`

---

## Part 2 — GHL Marketplace App (15 min)

This wires OAuth so the backend can call the GHL API on behalf of the sub-account.

1. Sign in to `https://marketplace.gohighlevel.com` with the agency account
2. **My Apps → Create App**
   - App type: **Private**
   - Distribution: **Sub-Account**
   - Listing: **Private**
3. **Auth tab:**
   - Redirect URL: `https://soul-prosperity-command-center.vercel.app/api/ghl/oauth/callback`
   - Scopes to enable:
     ```
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
4. Save. GHL shows `client_id` (public) and `client_secret` (secret)
   - Copy `client_id` — you will add it to Vercel
   - **Stop the operator to manually add `client_secret` to Vercel** — you must not see or handle it
5. **Webhooks tab:**
   - Endpoint: `https://soul-prosperity-command-center.vercel.app/api/ghl/webhook`
   - Subscribe to: `ContactCreate`, `ContactUpdate`, `ContactTagUpdate`, `OpportunityCreate`, `OpportunityStatusUpdate`, `InboundMessage`, `OutboundMessage`, `OrderCreate`, `AppInstall`, `AppUninstall`
   - Save. Click **Send test event** — expect a `200` in Vercel function logs
6. **Add `client_id` to Vercel env vars:**
   - Open `https://vercel.com/gmoney0112-creates-projects/soul-prosperity-command-center/settings/environment-variables`
   - Add `GHL_CLIENT_ID` = the client_id you copied
   - Add `GHL_OAUTH_REDIRECT_URI` = `https://soul-prosperity-command-center.vercel.app/api/ghl/oauth/callback`
   - Add `GHL_USER_TYPE` = `Location`
   - Trigger a redeploy

---

## Part 3 — GHL Sub-Account Setup (45–60 min)

Navigate to the sub-account: `https://app.gohighlevel.com/v2/location/ucphPUkSafuQF0ZCZh1T/dashboard`

Do these in order — tags and fields must exist before workflows reference them.

---

### Step 3A — Create Tags

**Path:** Settings → Tags → Add Tag (top-right button)

Create each tag exactly as listed (lowercase, hyphenated):

| Tag name | When applied |
|---|---|
| `lead-freebie` | Opts in for free resource |
| `buyer-ebook7` | Purchases $7 eBook |
| `buyer-audio17` | Purchases $17 audiobook bundle |
| `buyer-paperback27` | Purchases $27 paperback bundle |
| `buyer-course67` | Purchases $67 course |
| `buyer-toolkit97` | Purchases $97 course + AI toolkit bundle |
| `skool-trial` | Starts Skool free trial |
| `skool-monthly` | Active $47/mo Skool member |
| `skool-annual` | Active $247/yr Skool member |
| `lifetime` | $497 lifetime access |
| `abandoned-checkout` | Initiated checkout, did not complete |
| `refund-risk` | Dispute or refund request opened |
| `refunded` | Refund processed |
| `testimonial-requested` | Sent testimonial request |
| `unsubscribed-email` | Unsubscribed from email |
| `sms-opt-out` | Replied STOP to SMS |
| `vip` | High-LTV or manually flagged VIP |

---

### Step 3B — Create Custom Contact Fields

**Path:** Settings → Custom Fields → Contact → Add Field

| Field label | Field key | Type | Notes |
|---|---|---|---|
| First Purchase Date | `first_purchase_date` | Date | Auto-set on first purchase |
| Last Purchase Product | `last_purchase_product` | Text | e.g. "course67", "toolkit97" |
| LTV (cents) | `ltv_cents` | Number | Store in cents to avoid decimals |
| Freebie Source | `freebie_source` | Text | e.g. "instagram-reel", "youtube" |
| Skool Invite Sent | `skool_invite_sent` | Checkbox | True once Skool invite delivered |
| Refund Reason | `refund_reason` | Text | Free text from refund form |
| NPS Score | `nps_score` | Number | 0–10 |
| Preferred Channel | `preferred_channel` | Dropdown | Options: Email, SMS, Both |

---

### Step 3C — Create Pipeline

**Path:** Opportunities → Pipelines → Add Pipeline

- Pipeline name: **Soul Prosperity Ladder**
- Add stages in this order:

| Stage name | Entry condition |
|---|---|
| Lead — Freebie | Tag `lead-freebie` added |
| $7 Buyer | Tag `buyer-ebook7` added |
| $17 Buyer | Tag `buyer-audio17` added |
| $27 Buyer | Tag `buyer-paperback27` added |
| $67 Buyer | Tag `buyer-course67` added |
| $97 Buyer | Tag `buyer-toolkit97` added |
| Skool Member | Tag `skool-trial` or `skool-monthly` added |
| Annual Member | Tag `skool-annual` added |
| Lifetime | Tag `lifetime` added |
| Churned / Refunded | Tag `refunded` added |

Save. Copy the pipeline board URL and update `config.js` → `ghl.opportunitiesUrl`.

---

### Step 3D — Build Workflows

**Path:** Automation → Workflows → + New Workflow → Start from Scratch

Build all 8 workflows below. Name them exactly as shown (IDs help with cross-referencing).

---

#### WF-01 — Freebie Opt-in Nurture

**Trigger:** Form Submitted (select the freebie opt-in form once created)  
**Goal:** Deliver freebie, build trust, convert to $7 eBook within 3 days

| Step | Action |
|---|---|
| 1 | Add Tag: `lead-freebie` |
| 2 | Move to Pipeline stage: Lead — Freebie |
| 3 | Set custom field `freebie_source` = UTM source or "direct" |
| 4 | Send Email immediately — Subject: "Your Free eBook Starter Kit is inside 👇" |
| 5 | Wait 1 day |
| 6 | Send SMS — "Hey {{contact.first_name}} — did you get a chance to flip through the starter kit? The $7 eBook takes it 10x deeper. Grab it here: [EBOOK LINK]" |
| 7 | Wait 1 day |
| 8 | Send Email — Subject: "The one thing holding most writers back (it's not talent)" |
| 9 | Wait 1 day |
| 10 | Send Email — Subject: "Last call — $7 gets you the full blueprint" |
| **Exit condition** | Contact purchases $7 eBook (tag `buyer-ebook7` added) → remove from workflow |

---

#### WF-02 — $7 eBook Buyer Onboarding + $17 Upsell

**Trigger:** Tag Added = `buyer-ebook7`  
**Goal:** Deliver eBook, celebrate the win, pitch $17 audiobook within 48h

| Step | Action |
|---|---|
| 1 | Remove from WF-01 if active |
| 2 | Move to Pipeline stage: $7 Buyer |
| 3 | Set custom field `last_purchase_product` = "ebook7" |
| 4 | Set custom field `first_purchase_date` = today (if empty) |
| 5 | Update LTV: add 700 to `ltv_cents` |
| 6 | Send Email immediately — Subject: "You're in. Here's your eBook 📖" (include download link) |
| 7 | Wait 2 hours |
| 8 | Send Email — Subject: "Want the audiobook version too?" (pitch $17 bundle) — include link: `https://link.fastpaydirect.com/payment-link/69ef5e77557558e89e524ca3` |
| 9 | Wait 1 day |
| 10 | Send SMS — "{{contact.first_name}}, the audiobook version of the eBook just dropped. 17 bucks. Listen while you drive. [AUDIO LINK]" |
| **Exit condition** | Tag `buyer-audio17` added → remove from workflow |

---

#### WF-03 — $17 Audiobook Buyer + $27 Upsell

**Trigger:** Tag Added = `buyer-audio17`  
**Goal:** Deliver audiobook access, pitch $27 paperback within 48h

| Step | Action |
|---|---|
| 1 | Remove from WF-02 if active |
| 2 | Move to Pipeline stage: $17 Buyer |
| 3 | Set `last_purchase_product` = "audio17" |
| 4 | Update LTV: add 1700 to `ltv_cents` |
| 5 | Send Email immediately — Subject: "Your audiobook access is ready 🎧" |
| 6 | Wait 1 day |
| 7 | Send Email — Subject: "Want a physical copy on your shelf?" (pitch $27 paperback) — link: `https://link.fastpaydirect.com/payment-link/69ef5ed97dd3512d9207b2a6` |
| 8 | Wait 1 day |
| 9 | Send SMS — "Audiobook reader → now imagine having the physical book too. $27 ships to your door. [PAPERBACK LINK]" |
| **Exit condition** | Tag `buyer-paperback27` added → remove |

---

#### WF-04 — $27 Paperback Buyer + $67 Course Upsell

**Trigger:** Tag Added = `buyer-paperback27`  
**Goal:** Confirm order, pitch $67 course within 3 days

| Step | Action |
|---|---|
| 1 | Remove from WF-03 if active |
| 2 | Move to Pipeline stage: $27 Buyer |
| 3 | Set `last_purchase_product` = "paperback27" |
| 4 | Update LTV: add 2700 to `ltv_cents` |
| 5 | Send Email immediately — Subject: "Order confirmed — your book is on its way 📦" |
| 6 | Wait 2 days |
| 7 | Send Email — Subject: "The book is theory. The course is results." (pitch $67 course) — link: `https://link.fastpaydirect.com/payment-link/69ef5fc0557558e89e524ca5` |
| 8 | Wait 1 day |
| 9 | Send SMS — "Book reader check-in — if you want the step-by-step system, the $67 course is the move. [COURSE LINK]" |
| **Exit condition** | Tag `buyer-course67` added → remove |

---

#### WF-05 — $67 Course Buyer + $97 Toolkit Upsell

**Trigger:** Tag Added = `buyer-course67`  
**Goal:** Deliver course access, pitch $97 bundle within 48h

| Step | Action |
|---|---|
| 1 | Remove from WF-04 if active |
| 2 | Move to Pipeline stage: $67 Buyer |
| 3 | Set `last_purchase_product` = "course67" |
| 4 | Update LTV: add 6700 to `ltv_cents` |
| 5 | Send Email immediately — Subject: "Course access unlocked — start here 🚀" |
| 6 | Wait 1 day |
| 7 | Send Email — Subject: "Add the AI Writing Toolkit and cut your writing time in half" (pitch $97 bundle) — link: `https://link.fastpaydirect.com/payment-link/69fe563e34d67b041e7e8747` |
| 8 | Wait 1 day |
| 9 | Send SMS — "Course student — want the AI toolkit that goes with it? $97 gets you both. [TOOLKIT LINK]" |
| **Exit condition** | Tag `buyer-toolkit97` added → remove |

---

#### WF-06 — $97 Bundle Buyer + Skool Upsell

**Trigger:** Tag Added = `buyer-toolkit97`  
**Goal:** Confirm bundle delivery, pitch Skool community

| Step | Action |
|---|---|
| 1 | Remove from WF-05 if active |
| 2 | Move to Pipeline stage: $97 Buyer |
| 3 | Set `last_purchase_product` = "toolkit97" |
| 4 | Update LTV: add 9700 to `ltv_cents` |
| 5 | Send Email immediately — Subject: "Bundle unlocked — course + AI toolkit, all yours ✅" |
| 6 | Wait 2 days |
| 7 | Send Email — Subject: "You've got the tools. Now get the community." (pitch Skool) — link: `https://skool.com/money-masters-academy-5443/about` |
| 8 | Wait 2 days |
| 9 | Send SMS — "{{contact.first_name}} — Money Masters Academy is where the serious ones go. Free trial. No pressure. [SKOOL LINK]" |
| **Exit condition** | Tag `skool-trial` added → remove |

---

#### WF-07 — Skool Member Onboarding + Lifetime Upsell

**Trigger:** Tag Added = `skool-trial`  
**Goal:** Welcome to community, convert trial to paid, long-term pitch lifetime at 30 days

| Step | Action |
|---|---|
| 1 | Move to Pipeline stage: Skool Member |
| 2 | Set `last_purchase_product` = "skool-trial" |
| 3 | Set custom field `skool_invite_sent` = true |
| 4 | Send Email immediately — Subject: "Welcome to Money Masters Academy 🏆" (include Skool link) |
| 5 | Wait 3 days |
| 6 | Send Email — "How's the community treating you?" (check-in, surface testimonials) |
| 7 | Wait 4 days |
| 8 | **If/Else:** Check if tag `skool-monthly` or `skool-annual` present |
|   | **Yes** → skip to step 10 |
|   | **No** → Send SMS: "Trial ending soon — lock in your spot: [SKOOL LINK]" |
| 9 | Wait 3 days → Send Email — "Your trial is wrapping up. Here's what members say..." (social proof pitch) |
| 10 | Wait 20 days |
| 11 | Send Email — Subject: "One move that changes everything: Lifetime access" — link: `https://link.fastpaydirect.com/payment-link/69ef60c87dd3512d9207b2ac` |
| **Exit condition** | Tag `lifetime` added → move to WF-08 |

---

#### WF-08 — Lifetime Member VIP Flow

**Trigger:** Tag Added = `lifetime`  
**Goal:** Celebrate the commitment, add VIP tag, request testimonial at 14 days

| Step | Action |
|---|---|
| 1 | Add Tag: `vip` |
| 2 | Move to Pipeline stage: Lifetime |
| 3 | Set `last_purchase_product` = "lifetime" |
| 4 | Update LTV: add 49700 to `ltv_cents` |
| 5 | Send Email immediately — Subject: "You're in for life. Welcome to the vault. 🔐" |
| 6 | Wait 3 days |
| 7 | Send Email — "Quick check-in from Terrance — how's it going?" (personal tone) |
| 8 | Wait 11 days |
| 9 | Set custom field `testimonial_requested` (add tag `testimonial-requested`) |
| 10 | Send Email — Subject: "Would you share your story?" (testimonial request with form link) |
| 11 | Send SMS — "{{contact.first_name}} — 14 days in. I'd love to share your story. Mind filling this out? [FORM LINK]" |

---

## Part 4 — QA Before Traffic (browser agent runs this)

Use a throwaway test contact (e.g. `test+qa@yourdomain.com`).

- [ ] Submit freebie opt-in form → confirm tag `lead-freebie` added, WF-01 fires, welcome email received
- [ ] Manually add tag `buyer-ebook7` → confirm WF-01 exits, WF-02 fires, pipeline moves to $7 Buyer
- [ ] Manually add tag `buyer-audio17` → confirm WF-02 exits, WF-03 fires
- [ ] Manually add tag `buyer-toolkit97` → confirm pipeline moves to $97 Buyer
- [ ] Manually add tag `skool-trial` → confirm WF-07 fires, `skool_invite_sent` = true
- [ ] Manually add tag `lifetime` → confirm `vip` tag added, pipeline moves to Lifetime
- [ ] Confirm SMS respects quiet hours (no messages 9pm–9am local)
- [ ] Reply STOP to an SMS → confirm `sms-opt-out` tag added, no further SMS in any workflow
- [ ] Unsubscribe from email → confirm `unsubscribed-email` tag added

---

## Part 5 — After QA: Update config.js

Once the pipeline is created, get the pipeline board URL and update the repo:

1. Open `https://app.gohighlevel.com/v2/location/ucphPUkSafuQF0ZCZh1T/opportunities`
2. Select the **Soul Prosperity Ladder** pipeline — copy the URL with the pipeline ID
3. In the repo, edit `config.js` → `ghl.opportunitiesUrl` with that URL
4. When the freebie opt-in page is created, add the URL to `config.js` → `freebieOptIn`
5. When the booking calendar is created, add the URL to `config.js` → `ghl.calendarBookingUrl`
6. Commit and push — Vercel redeploys automatically

---

## Remaining Operator-Only Steps (human required)

These cannot be done by a browser agent safely:

| Task | Why human only |
|---|---|
| Add `GHL_CLIENT_SECRET` to Vercel | Secret must be entered by account owner, never seen by agent |
| Create freebie opt-in page/form content | Requires creative/brand decisions |
| Connect payment processor (FastPayDirect → GHL) | Requires account credentials |
| Approve and merge PRs to `main` | Repo governance |

---

## Verification Commands (run after everything)

```bash
# Health check — all should be true
curl -s https://soul-prosperity-command-center.vercel.app/api/ghl/health | jq

# Expected:
# { "ok": true, "ready": { "oauth": true, "webhook": true }, "tokenStorageBackend": "vercel-kv" }
```

If `ready.oauth = false`: check Vercel env vars `GHL_CLIENT_ID`, `GHL_CLIENT_SECRET`, and that KV is connected.  
If `ready.webhook = false`: this should not happen — webhook verification uses baked-in public keys with no env dependency.
