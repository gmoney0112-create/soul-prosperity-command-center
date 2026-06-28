# GHL Payment Link → Auto-Tag Wiring Guide
## Soul Prosperity Command Center

**Updated:** 2026-06-28 — Architecture verified by browser agent  
**Previous assumption (now corrected):** FastPayDirect is external and needs a webhook bridge.  
**Actual architecture:** The payment links (`link.fastpaydirect.com/payment-link/...`) are
**GHL-native payment links** — FastPayDirect is the payment processor but GHL owns the order.
This means GHL already fires `OrderCreate` natively when someone buys. No external webhook
bridge or Zapier is needed.

---

## The Remaining Gap

All 8 workflows are published and use **"Tag Added"** triggers (e.g., WF-02 fires when
`buyer-ebook7` is added). GHL knows about every purchase. The single missing piece is:

> **GHL must apply the correct buyer tag automatically when an order completes.**

Once that is wired, the entire funnel runs without any further setup.

---

## Option A — GHL "Order Submitted" Bridge Workflow (Recommended)

This is the cleanest solution inside GHL with no code or third-party tools.

Create one short bridge workflow per payment link. Each bridge:
1. Triggers on **Order Submitted** (filtered to the specific payment link)
2. Adds the corresponding buyer tag
3. That tag fires the main nurture workflow (WF-02 through WF-08) automatically

### Build each bridge workflow

**Path:** Automation → Workflows → + New Workflow → Start from Scratch

| Bridge workflow name | Order trigger (payment link) | Tag to apply |
|---|---|---|
| ORDER: $7 eBook | `69ef5c807dd3512d9207b2a2` | `buyer-ebook7` |
| ORDER: $17 Audiobook | `69ef5e77557558e89e524ca3` | `buyer-audio17` |
| ORDER: $27 Paperback | `69ef5ed97dd3512d9207b2a6` | `buyer-paperback27` |
| ORDER: $67 Course | `69ef5fc0557558e89e524ca5` | `buyer-course67` |
| ORDER: $97 Bundle | `69fe563e34d67b041e7e8747` | `buyer-toolkit97` |
| ORDER: $497 Lifetime | `69ef60c87dd3512d9207b2ac` | `lifetime` |

**Steps for each bridge workflow:**

1. **New Workflow → Start from Scratch**
2. **Trigger:** Order Submitted
   - Filter: Funnel/Website Product = `[select the matching product/payment link]`
   - Or filter by Product name / Product ID if available
3. **Action 1:** Add Tag → `buyer-ebook7` (or appropriate tag per table above)
4. **Action 2 (optional):** Set contact field `first_purchase_date` = today (if empty)
5. Publish

> The main nurture workflow (WF-02, etc.) fires automatically the moment the tag lands —
> you do not need to add email/SMS steps to the bridge workflow.

---

## Option B — GHL Products / Order Rules (Native, if available on your plan)

Some GHL plans support **Products with order rules** where you can assign a tag to be
applied automatically when a product is purchased. Check:

**Path:** Payments → Products → select the product → look for "Tags" or "Automation" tab

If you see a tag field on the product, add the corresponding buyer tag there. GHL will
apply it automatically on order completion — no bridge workflow needed.

---

## Option C — Vercel Webhook Handler (Code-based, most flexible)

The existing `/api/ghl/webhook` endpoint receives `OrderCreate` events from GHL. You
can add logic to call the GHL Contacts API to apply a tag based on which payment link
was purchased. This is the most powerful option but requires adding code.

**Requires:** `GHL_CLIENT_SECRET` in Vercel (still pending), Vercel KV connected.

**Not recommended until OAuth is fully connected.** Use Option A first.

---

## Verification Steps (run after wiring)

1. Make a test purchase using GHL's **test mode** on one payment link
2. Confirm the contact appears in GHL Contacts within 60 seconds
3. Confirm the buyer tag is applied (e.g., `buyer-ebook7`)
4. Confirm the corresponding workflow's Execution History shows a new run
5. Confirm the welcome email arrives in the test inbox
6. Check pipeline — contact should be in the correct stage (e.g., `$7 Buyer`)

---

## Skool → GHL Wiring

When a member joins Skool (trial or paid), the `skool-trial`, `skool-monthly`, or
`skool-annual` tag needs to be applied in GHL to fire WF-07.

Skool does not currently have a native GHL integration. Options:

### Option A — Zapier Bridge
1. **Trigger:** Skool → New Member Joined
2. **Action:** GoHighLevel → Add Tag to Contact (`skool-trial`)
3. For plan upgrades, add a second Zap on "Member Plan Changed" → `skool-annual`

### Option B — Manual (acceptable for low volume)
Manually apply tags in GHL Contacts when you see new Skool members. Not scalable
but functional until a Zapier integration is set up.

---

## Current Status Summary

| Component | Status | Notes |
|---|---|---|
| GHL payment links | ✅ Live | All 6 products active in GHL Payments |
| `OrderCreate` webhook delivery to Vercel | ✅ Configured | `/api/ghl/webhook` receives it |
| Buyer tag application on purchase | ⏳ Needs wiring | Use Option A above |
| Main nurture workflows (WF-01..WF-08) | ✅ Published | Fire when tag is added |
| Skool → GHL sync | ⏳ Needs wiring | Zapier or manual until native available |
| `GHL_CLIENT_SECRET` in Vercel | ⏳ Operator only | Required for OAuth / Option C |
