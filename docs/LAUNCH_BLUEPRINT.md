# Soul Prosperity — Launch Blueprint

This is the operator-facing index for the launch blueprint. The static
dashboard at `/index.html` exposes the same documents through the
**Launch Blueprint** section. This file exists so you can read the
blueprint on GitHub, print it, or share it with another operator
without spinning up the site.

The blueprint is the bridge between the technical wiring (already
covered in [`README.md`](../README.md) and [`docs/GHL_SETUP.md`](GHL_SETUP.md))
and the business work of running ads and creating content. It does not
replace either — it sits on top.

---

## The eight documents (read in order)

1. **Funnel map** — `source-assets/funnel-map.html`
   The full offer ladder: freebie → $7 ebook → $17 audio bump → $27
   paperback → $67 course → Skool $47/mo → Skool $247/yr → $497 lifetime.
   The map shows which GHL workflow owns each transition.

2. **Paid traffic launch plan** — `source-assets/paid-traffic-plan.html`
   Campaign structure (cold ebook, cold freebie, retarget cart, retarget
   buyer), audiences (broad, lookalikes, interest stacks, exclusions),
   five ad angles with three hooks each, a creative-format table, a
   qualitative budget ramp, an 8-cell testing matrix, and a scale/kill
   rule table. No dollar predictions — only structure.

3. **Content engine plan** — `source-assets/content-engine-plan.html`
   30-day calendar with pitch/value/story balance, five short-form
   video scripts with the 4-beat (Hook → Promise → Proof → CTA)
   structure, hashtag stacks, and a one-pillar-becomes-seven-outputs
   repurposing pipeline.

4. **Email &amp; SMS sequence templates** — `source-assets/email-sms-sequences.html`
   Production-ready copy for WF-01 through WF-08 in
   [`docs/GHL_SETUP.md`](GHL_SETUP.md). Each message names its workflow,
   delay, channel, merge fields, and includes the legally required STOP
   clause for the first SMS in each sequence.

5. **Ad copy swipe file** — `source-assets/ad-copy-swipe-file.html`
   Multiple variants per angle, formatted for Meta primary text,
   headline, and description. Covers Meta Reels, TikTok captions,
   YouTube Short descriptions, statics, carousels, and retargeting.

6. **Tracking &amp; analytics spec** — `source-assets/tracking-spec.html`
   The naming-convention contract. UTM template, conversion event names
   (`view_content`, `lead_freebie`, `begin_checkout`, `purchase_ebook7`,
   `purchase_audio17`, `purchase_paperback27`, `purchase_course67`,
   `purchase_lifetime497`, `start_skool_trial`, `start_skool_monthly`,
   `start_skool_annual`, `refund_requested`), pixel-parameter shape,
   thank-you-page firing snippet, and the GHL custom fields the
   dashboard expects. The dashboard, the pixel, and GHL must all use
   these names — no synonyms.

7. **Preflight QA** — `source-assets/preflight-qa.html`
   The 60-minute human walkthrough that gates traffic. Six sections:
   static dashboard, funnel pages, GHL automation, tracking,
   compliance/deliverability, operations. Every row is a yes/no test
   against a real test contact and a real test transaction.

8. **Launch day runbook** — `source-assets/launch-day-runbook.html`
   T-24h, T-0, T+1h–4h, T+4h–24h, day 2, days 3–7. Includes the
   emergency-stop conditions that pause spend immediately
   (WF-02 not firing, refund rate &gt; 10% in 48h, pixel down,
   payment-provider flag, support coverage gap).

The dashboard's **GHL Build Sheet** section (rendered in
`index.html`) is the ninth document — the operator build sheet for
the GHL side. It is reachable in the page nav as **Build Sheet**.

---

## What this blueprint does NOT do

- **Connect accounts.** Stripe, GoHighLevel, Skool, Meta Business
  Manager, TikTok Ads — only you can authenticate to those. The
  dashboard reports placeholder vs. ready and the validator warns on
  unset production fields. None of that creates an account, signs a
  contract, or links a payment processor.
- **Predict revenue.** The on-page calculator models math; it does not
  forecast. Real numbers come from real ad spend and real creative.
- **Replace human judgment.** The kill rules and quiet-hours are
  starting points, not laws. Override them when the situation calls
  for it — but do not override them silently.

---

## The user-owned account steps (must be done by hand)

These are the "I cannot do this for you" items. They are listed in the
order you should do them.

1. **Create the GHL sub-account** for Soul Prosperity (see
   [`docs/GHL_SETUP.md` § 1](GHL_SETUP.md)).
2. **Set up Stripe** inside the sub-account; verify bank account.
3. **Create the eight products** in GHL with the correct prices ($7,
   $17, $27, $67, $47/mo, $247/yr, $497).
4. **Build the eight workflows** WF-01 through WF-08 using the
   automation sequences in `source-assets/email-sms-sequences.html`
   and the GHL Build Sheet in the dashboard.
5. **Set up Meta Pixel + TikTok Pixel + GA4** with the event names
   in the tracking spec. Verify each fires with the platform debugger.
6. **Verify sending domain** (SPF / DKIM / DMARC). Run a mail-tester
   check; aim for 9+/10.
7. **Connect Skool** — create the group, the trial pricing, the annual,
   and the lifetime tiers; paste their URLs into `config.js`.
8. **Stand up the Marketplace OAuth app** (only if you need API access
   beyond the static dashboard) — full guide in
   [`docs/GHL_SETUP.md` § 2](GHL_SETUP.md).
9. **Walk preflight QA** top to bottom on a real test contact.
10. **Open the launch day runbook**, follow it minute by minute.

---

## Tags, fields, and event names — quick reference

The dashboard's GHL Build Sheet, the tracking spec, and the email/SMS
sequences all reference the same names. Treat this list as the source
of truth for renames.

### Tags

`lead-freebie` · `buyer-ebook7` · `buyer-audio17` · `buyer-paperback27`
· `buyer-course67` · `skool-trial` · `skool-monthly` · `skool-annual`
· `lifetime` · `abandoned-checkout` · `refund-risk` · `refunded`
· `testimonial-requested` · `unsubscribed-email` · `sms-opt-out` · `vip`

### Custom fields

`first_purchase_date` · `last_purchase_product` · `ltv_cents`
· `freebie_source` · `skool_invite_sent` · `refund_reason`
· `nps_score` · `preferred_channel`
· `utm_source` · `utm_medium` · `utm_campaign` · `utm_content` · `utm_term`

### Conversion events

`view_content` · `lead_freebie` · `begin_checkout` · `add_payment_info`
· `purchase_ebook7` · `purchase_audio17` · `purchase_paperback27`
· `purchase_course67` · `purchase_lifetime497`
· `start_skool_trial` · `start_skool_monthly` · `start_skool_annual`
· `refund_requested`

---

## Versioning

This blueprint is v1. When a document materially changes — a new
workflow, an event rename, a new ad angle that consistently outperforms
— bump the version of that file and note the change in the dashboard
**Launch Blueprint** section so other operators know to re-read it.
