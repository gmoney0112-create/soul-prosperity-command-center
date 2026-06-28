# FastPayDirect → GHL Purchase Webhook Wiring
## Soul Prosperity Command Center

**Why this matters:** All 8 GHL workflows are published and waiting. They trigger on tags
(`buyer-ebook7`, `buyer-audio17`, etc.). Those tags are applied by GHL automation
when a purchase event arrives. Without this wiring, the tags are never added, so no
workflow ever fires — the automation is fully built but deaf to real orders.

**Date:** 2026-06-28  
**GHL Sub-account:** `https://app.gohighlevel.com/v2/location/ucphPUkSafuQF0ZCZh1T/dashboard`

---

## Option A — FastPayDirect Native Webhook (Recommended)

FastPayDirect supports outbound webhooks on successful payment. You configure one webhook
per product (or one global webhook with a product field in the payload) and point it at
a GHL workflow or the GHL API.

### Step 1 — Create a GHL Webhook Trigger Workflow for Each Product

For each product, create a **short bridge workflow** in GHL that:
1. Receives an inbound webhook
2. Adds the correct buyer tag

**Do this 6 times** (one per paid offer):

| Offer | Tag to apply | Webhook workflow name |
|---|---|---|
| $7 eBook | `buyer-ebook7` | WH-IN: $7 eBook Purchase |
| $17 Audiobook | `buyer-audio17` | WH-IN: $17 Audiobook Purchase |
| $27 Paperback | `buyer-paperback27` | WH-IN: $27 Paperback Purchase |
| $67 Course | `buyer-course67` | WH-IN: $67 Course Purchase |
| $97 Bundle | `buyer-toolkit97` | WH-IN: $97 Bundle Purchase |
| $497 Lifetime | `lifetime` | WH-IN: $497 Lifetime Purchase |

**Build each webhook-receiver workflow:**

1. Go to **Automation → Workflows → + New Workflow → Start from Scratch**
2. **Trigger:** Inbound Webhook
   - Click the trigger and copy the **Webhook URL** (unique per workflow)
   - Save this URL — you will paste it into FastPayDirect
3. **Action 1:** Add Tag → select the appropriate tag from the table above
4. **Action 2 (optional):** Update Contact Field → set `last_purchase_product` value
5. Publish the workflow

> The main buyer workflows (WF-02 through WF-06) already watch for these tags and will
> fire automatically the moment the tag is added — no further connection needed.

---

### Step 2 — Configure FastPayDirect Webhooks

1. Log in to **FastPayDirect** dashboard
2. Navigate to **Settings → Webhooks** (or per-product settings — check their UI)
3. For each product, paste the GHL webhook URL from Step 1:

| FastPayDirect Product | GHL Webhook URL |
|---|---|
| $7 eBook | (paste from WH-IN: $7 eBook Purchase workflow) |
| $17 Audiobook Bundle | (paste from WH-IN: $17 Audiobook Purchase workflow) |
| $27 Paperback Bundle | (paste from WH-IN: $27 Paperback Purchase workflow) |
| $67 Online Course | (paste from WH-IN: $67 Course Purchase workflow) |
| $97 Course + AI Toolkit | (paste from WH-IN: $97 Bundle Purchase workflow) |
| $497 Lifetime Access | (paste from WH-IN: $497 Lifetime Purchase workflow) |

4. Set the trigger event to **Payment Successful** (or equivalent — look for "Order Complete",
   "Successful Payment", or "Checkout Complete")
5. Save each webhook and send a **test event** from FastPayDirect's UI

---

### Step 3 — Map the Contact to GHL

GHL needs an email address to find or create the contact. FastPayDirect should send
`email` in the webhook payload. In the GHL webhook-receiver workflow:

- After the trigger, add action: **Update Contact** with `{{trigger.email}}`
  (or whatever field name FastPayDirect uses — check the test event payload)
- If no contact exists, GHL creates one automatically when using Inbound Webhook

**Typical FastPayDirect payload fields:**
```json
{
  "email": "buyer@example.com",
  "first_name": "Jane",
  "last_name": "Doe",
  "amount": "7.00",
  "product_name": "Soul Prosperity eBook",
  "order_id": "ord_abc123",
  "status": "paid"
}
```

If the payload structure differs, use GHL's **Custom Values** mapping in the workflow
trigger settings to bind `{{trigger.email}}` correctly.

---

## Option B — Zapier Bridge (fallback if native webhooks are unavailable)

If FastPayDirect does not support outbound webhooks natively:

1. Open **Zapier** and create a new Zap
2. **Trigger:** FastPayDirect → New Sale / New Order
3. **Action:** GoHighLevel (LeadConnector) → Add Tag to Contact
4. Map: `email` from FastPayDirect → Contact email in GHL; tag = appropriate buyer tag
5. Test and publish

Create one Zap per offer tier, or use a single Zap with conditional paths (Zapier Paths).

---

## Skool → GHL Wiring

When a member joins Skool (trial or paid), the `skool-trial`, `skool-monthly`, or
`skool-annual` tag needs to be applied in GHL to fire WF-07.

### Option A — Skool Native Webhook (if available)

Skool is adding webhook support. If your Skool plan includes it:

1. Open **Money Masters Academy → Settings → Integrations → Webhooks**
2. Point the "Member Joined" event at a GHL inbound webhook URL (create a bridge workflow
   the same way as FastPayDirect above)
3. Map email → GHL contact, apply tag `skool-trial`

### Option B — Zapier Bridge

1. **Trigger:** Skool → New Member Joined
2. **Action:** GoHighLevel → Add Tag to Contact (`skool-trial`)
3. For upgrades (monthly → annual), add a second Zap on "Member Plan Changed"

### Option C — Manual (acceptable for low volume)

Until webhooks are wired, manually apply tags in GHL from the Contacts screen
when you see a new Skool member. Not scalable but functional.

---

## Verification Checklist

After wiring:

- [ ] Place a live $7 test purchase (or use FastPayDirect test mode)
- [ ] Confirm GHL contact created/found and `buyer-ebook7` tag appears within 60 seconds
- [ ] Confirm WF-02 fires immediately (check Execution History in GHL workflow)
- [ ] Confirm welcome email arrives in test inbox
- [ ] Repeat for one more offer tier to confirm pattern works
- [ ] Join Skool with a test account → confirm `skool-trial` tag added → WF-07 fires

---

## Important: LTV Tracking

Each workflow step that updates LTV (`ltv_cents` custom field) uses **add** logic:
- WF-02 adds 700 (for $7)
- WF-03 adds 1700 (for $17)
- etc.

This means a contact who upgrades through multiple tiers accumulates the correct lifetime
value automatically, as long as GHL creates/finds the same contact record (matched by email).

---

## After Everything Is Wired

Update `config.js` with any new URLs and commit:

```bash
# After pipeline URL is known:
# config.js → ghl.opportunitiesUrl = <pipeline board URL>

# After booking calendar is created:
# config.js → ghl.calendarBookingUrl = <Calendly or GHL calendar URL>

# After freebie opt-in form is live:
# config.js → freebieOptIn = <opt-in page URL>
```
