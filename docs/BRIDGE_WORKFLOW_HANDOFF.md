# Browser Agent Handoff — Build 6 Order Bridge Workflows
## Soul Prosperity Command Center

**Compatible with:** Comet, Claude + Google Chrome extension, browser-use, Manus, Playwright agent

**Date:** 2026-06-28  
**GHL sub-account:** `https://app.gohighlevel.com/v2/location/ucphPUkSafuQF0ZCZh1T/dashboard`  
**Time estimate:** 20–30 minutes

---

## Why This Exists

All 8 nurture workflows are published and trigger on a buyer tag being added. The GHL
payment links already fire `OrderCreate` natively when a customer buys — but nothing
currently converts that order event into the buyer tag. These 6 bridge workflows close
that gap.

**The complete flow once done:**

```
Customer clicks payment link → pays → GHL fires Order Submitted
  → Bridge workflow adds buyer tag (e.g., buyer-ebook7)
    → Main nurture workflow (WF-02) triggers automatically
      → Welcome email + upsell sequence starts
```

---

## Security Rules (never break these)

- **Never** record, screenshot, copy, or transmit `GHL_CLIENT_SECRET`, `GHL_PIT_KEY`, access tokens, or refresh tokens
- **Never** commit any value to the repo
- **Never** write tokens, credentials, or secrets to browser storage

---

## Current State (skip what's done)

| Item | Status |
|---|---|
| All 17 GHL tags created | ✅ done |
| All 8 custom fields created | ✅ done |
| Pipeline "Soul Prosperity Ladder" (9 stages) | ✅ done |
| WF-01 through WF-08 published | ✅ done |
| 6 Order bridge workflows | ⏳ **your job** |

---

## Task — Build These 6 Bridge Workflows

**Path:** Automation → Workflows → + New Workflow → Start from Scratch

Build one workflow per row. Name them exactly as shown.

| Workflow name | Order Submitted product filter | Tag to add |
|---|---|---|
| `ORDER: $7 eBook` | $7.00 / eBook product | `buyer-ebook7` |
| `ORDER: $17 Audiobook` | $17.00 / Audiobook product | `buyer-audio17` |
| `ORDER: $27 Paperback` | $27.00 / Paperback product | `buyer-paperback27` |
| `ORDER: $67 Course` | $67.00 / Course product | `buyer-course67` |
| `ORDER: $97 Bundle` | $97.00 / AI Toolkit bundle product | `buyer-toolkit97` |
| `ORDER: $497 Lifetime` | $497.00 / Lifetime product | `lifetime` |

---

## Step-by-Step for Each Bridge Workflow

Repeat these steps 6 times (one per row in the table above).

### 1. Create the workflow

- Automation → Workflows → **+ New Workflow** → **Start from Scratch**
- Click the workflow name at the top and rename it (e.g., `ORDER: $7 eBook`)

### 2. Set the trigger

- Click **Add new trigger**
- Search for and select: **Order Submitted**
- Under filters, filter by the matching product or payment link:
  - Look for a filter like "Product", "Payment Link", "Funnel", or "Price"
  - Select the matching product from the dropdown (match by price if product names are generic)
  - If no filter is available, leave unfiltered and rely on the action being tag-specific
- Click **Save Trigger**

### 3. Add the tag action

- Click **+** to add an action
- Search for: **Add Tag** (or "Contact Tag")
- Select tag: `buyer-ebook7` (or appropriate tag per table above)
- Save the action

### 4. (Optional but recommended) Set first_purchase_date

- Click **+** to add another action after the tag
- Search for: **Update Contact Field** (or "Set Custom Field")
- Field: `first_purchase_date`
- Value: `{{now}}` or the current date placeholder
- Add a condition: only update if the field is currently empty (prevents overwriting for repeat buyers)
- Save

### 5. Publish

- Toggle the workflow from **Draft → Published**
- Click **Save**

---

## Quick Reference — Payment Link IDs

If GHL asks you to filter by payment link URL or ID:

| Tag | Full payment link URL |
|---|---|
| `buyer-ebook7` | `https://link.fastpaydirect.com/payment-link/69ef5c807dd3512d9207b2a2` |
| `buyer-audio17` | `https://link.fastpaydirect.com/payment-link/69ef5e77557558e89e524ca3` |
| `buyer-paperback27` | `https://link.fastpaydirect.com/payment-link/69ef5ed97dd3512d9207b2a6` |
| `buyer-course67` | `https://link.fastpaydirect.com/payment-link/69ef5fc0557558e89e524ca5` |
| `buyer-toolkit97` | `https://link.fastpaydirect.com/payment-link/69fe563e34d67b041e7e8747` |
| `lifetime` | `https://link.fastpaydirect.com/payment-link/69ef60c87dd3512d9207b2ac` |

These also appear in GHL → Payments → Payment Links for reference.

---

## If "Order Submitted" Trigger Is Not Available

Some GHL plans show this trigger as "Order Form Submitted" or under a different name.
Try searching for:

- `Order`
- `Purchase`
- `Payment`
- `Checkout`
- `Product`

If none of these appear in the trigger list, try this alternative:

1. Go to **GHL → Payments → Products**
2. Open each product
3. Look for a **Tags** or **Automation** tab on the product settings
4. Add the buyer tag directly there — GHL will apply it automatically on purchase
5. No workflow needed if this is available

---

## Verification After Each Workflow

After building all 6:

1. Go to GHL → Payments → Payment Links
2. Click a payment link and use **Test Mode** (or send a $0 test order if available)
3. Check GHL Contacts — the test contact should have the buyer tag within 60 seconds
4. Check GHL → Automation → Workflow Execution History for the bridge workflow — confirm it ran
5. Check the corresponding main nurture workflow (e.g., WF-02) — confirm it also ran

---

## Completion Checklist

- [ ] `ORDER: $7 eBook` — built and published
- [ ] `ORDER: $17 Audiobook` — built and published
- [ ] `ORDER: $27 Paperback` — built and published
- [ ] `ORDER: $67 Course` — built and published
- [ ] `ORDER: $97 Bundle` — built and published
- [ ] `ORDER: $497 Lifetime` — built and published
- [ ] Test purchase verified end-to-end (tag applied → nurture workflow fired)

Once all 6 are live, the system is 100% end-to-end automated.
