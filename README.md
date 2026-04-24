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
