// Central configuration for all external destinations used by the
// Soul Prosperity Funnel Command Center.
//
// Replace every "#" placeholder with the real URL as each piece of the
// funnel goes live. The Launch Links and GHL Wiring panels in the UI
// read this file and flag which destinations are still placeholders
// vs. ready.
//
// Placeholder rules:
//   - Empty, "#", or starts with "REPLACE_" → placeholder
//   - Anything else (including a valid http/https URL or a stable ID)
//     is treated as ready
//
// This file is loaded by the static dashboard with a plain <script>
// tag; do NOT add any runtime secrets here. Marketplace OAuth client
// secrets, location access tokens, and webhook signing secrets must
// stay out of this file. They belong in a backend / serverless
// function, not in the browser. See docs/GHL_SETUP.md for the
// operator setup guide.

window.SP_CONFIG = {
  // ── Funnel destinations (public URLs) ────────────────────────────
  // Freebie lead magnet opt-in page / form
  freebieOptIn: "#",

  // Checkout links for each paid offer
  ebook7Checkout: "#",
  audio17Checkout: "#",
  paperback27Checkout: "#",
  course67Checkout: "#",

  // Skool community paths
  skoolTrial: "#",
  skoolAnnual: "#",
  lifetimeAccess: "#",

  // Operations tooling (legacy flat shortcuts — kept for back compat)
  ghlDashboard: "#",
  ghlWorkflows: "#",
  analytics: "#",

  // Public bio link used across social profiles
  socialBioLink: "#",

  // ── GoHighLevel production wiring ────────────────────────────────
  // Operators: every value below is a placeholder until you fill it
  // in. None of these are secrets — they are public URLs, location
  // IDs, public client IDs, and operator-facing entry points. Real
  // secrets (client_secret, access_token, webhook signing secret) are
  // NEVER stored in this file. See docs/GHL_SETUP.md.
  ghl: {
    // The HighLevel sub-account (location) this dashboard operates
    // against. Found in GHL → Settings → Business Profile, or in any
    // sub-account URL: app.gohighlevel.com/v2/location/<LOCATION_ID>/...
    locationId: "REPLACE_GHL_LOCATION_ID",

    // ── Operator entry URLs (where this dashboard's links go) ─────
    // Sub-account home dashboard
    dashboardUrl: "#",
    // Automation → Workflows
    workflowsUrl: "#",
    // Marketing → Campaigns (email/SMS)
    campaignsUrl: "#",
    // Contacts → Smart List
    contactsUrl: "#",
    // Opportunities pipeline board for "Soul Prosperity Ladder"
    opportunitiesUrl: "#",
    // Conversations inbox
    conversationsUrl: "#",
    // Reporting → Dashboard (revenue + attribution)
    analyticsUrl: "#",
    // Public booking calendar (used in nurture emails / bio)
    calendarBookingUrl: "#",

    // ── Marketplace / OAuth (Authorization Code Grant, v2) ────────
    // App installation / authorization URL. HighLevel v2 uses:
    //   https://marketplace.gohighlevel.com/oauth/chooselocation
    //     ?response_type=code
    //     &redirect_uri=<your redirect>
    //     &client_id=<your public client id>
    //     &scope=<space-separated scopes>
    // The full URL goes here (operators paste the live install link).
    // Token exchange happens server-side at:
    //   https://services.leadconnectorhq.com/oauth/token
    // and is NEVER performed in this static dashboard.
    oauth: {
      // Public Marketplace client_id — safe to expose
      clientId: "REPLACE_GHL_CLIENT_ID",
      // Full chooselocation install URL with client_id, redirect_uri,
      // and scopes baked in. See docs/GHL_SETUP.md for the exact
      // string to construct.
      installUrl: "#",
      // Where HighLevel redirects after install with ?code=...
      // Must be HTTPS and registered in the Marketplace app.
      redirectUri: "REPLACE_OAUTH_REDIRECT_URI",
      // Space-separated v2 scope list. Recommended minimum:
      scopes:
        "contacts.readonly contacts.write conversations.readonly conversations.write conversations/message.write opportunities.readonly opportunities.write workflows.readonly locations.readonly",
    },

    // ── API endpoints (v2) ────────────────────────────────────────
    // These are HighLevel's public, fixed endpoints. Do NOT change
    // them unless HighLevel publishes a new base. They are kept here
    // so the operator guide and any future backend share one source
    // of truth.
    api: {
      base: "https://services.leadconnectorhq.com",
      version: "2021-07-28",
      tokenUrl: "https://services.leadconnectorhq.com/oauth/token",
      authBaseUrl: "https://marketplace.gohighlevel.com/oauth/chooselocation",
    },

    // ── Webhooks ──────────────────────────────────────────────────
    // Configure in Marketplace app → Advanced Settings → Webhooks.
    // Endpoint must be HTTPS and respond 2xx within ~10s. Production
    // handlers MUST verify the webhook signature and de-duplicate by
    // webhook id. See docs/GHL_SETUP.md for the verification snippet
    // and the list of subscribed events.
    webhook: {
      // Public URL operators can hand to HighLevel. The receiver
      // itself is a separate backend / serverless function — this
      // static dashboard does NOT receive webhooks.
      targetUrl: "REPLACE_WEBHOOK_TARGET_URL",
      // Subscribed event list (informational; configured in the
      // Marketplace UI, not by this file).
      events: [
        "ContactCreate",
        "ContactUpdate",
        "ContactTagUpdate",
        "OpportunityCreate",
        "OpportunityStatusUpdate",
        "InboundMessage",
        "OutboundMessage",
        "OrderCreate",
        "AppInstall",
        "AppUninstall",
      ],
    },
  },
};
