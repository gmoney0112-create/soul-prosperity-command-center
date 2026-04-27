// Sample populated config.js for the Soul Prosperity Funnel Command
// Center. Use this as a reference for the *shape* of real values —
// every URL and ID below is illustrative. Replace with the real
// values from your HighLevel sub-account, Stripe checkout pages, and
// Skool group before launch.
//
// IMPORTANT: there are NO secrets here. Do not add OAuth
// client_secret, access tokens, or webhook signing secrets to this
// file — they belong on a backend, never in the browser. See
// docs/GHL_SETUP.md.

window.SP_CONFIG = {
  // Funnel destinations (illustrative)
  freebieOptIn: "https://soulprosperity.example.com/freebie",
  ebook7Checkout: "https://buy.soulprosperity.example.com/ebook-7",
  audio17Checkout: "https://buy.soulprosperity.example.com/audio-17",
  paperback27Checkout: "https://buy.soulprosperity.example.com/paperback-27",
  course67Checkout: "https://buy.soulprosperity.example.com/course-67",
  skoolTrial: "https://www.skool.com/soul-prosperity/about?ref=trial",
  skoolAnnual: "https://www.skool.com/soul-prosperity/about?ref=annual",
  lifetimeAccess: "https://buy.soulprosperity.example.com/lifetime-497",
  ghlDashboard:
    "https://app.gohighlevel.com/v2/location/abc123XYZ/dashboard",
  ghlWorkflows:
    "https://app.gohighlevel.com/v2/location/abc123XYZ/automation/workflows",
  analytics:
    "https://app.gohighlevel.com/v2/location/abc123XYZ/reporting/dashboard",
  socialBioLink: "https://soulprosperity.example.com/links",

  // GoHighLevel production wiring (illustrative — non-secret only)
  ghl: {
    locationId: "abc123XYZ",

    dashboardUrl:
      "https://app.gohighlevel.com/v2/location/abc123XYZ/dashboard",
    workflowsUrl:
      "https://app.gohighlevel.com/v2/location/abc123XYZ/automation/workflows",
    campaignsUrl:
      "https://app.gohighlevel.com/v2/location/abc123XYZ/marketing/campaigns",
    contactsUrl:
      "https://app.gohighlevel.com/v2/location/abc123XYZ/contacts/smart_list/All",
    opportunitiesUrl:
      "https://app.gohighlevel.com/v2/location/abc123XYZ/opportunities/list?pipelineId=def456",
    conversationsUrl:
      "https://app.gohighlevel.com/v2/location/abc123XYZ/conversations/conversations",
    analyticsUrl:
      "https://app.gohighlevel.com/v2/location/abc123XYZ/reporting/dashboard",
    calendarBookingUrl:
      "https://api.leadconnectorhq.com/widget/booking/abc123XYZ",

    oauth: {
      clientId: "65f0a1b2c3d4e5f6a7b8c9d0-public",
      installUrl:
        "https://marketplace.gohighlevel.com/oauth/chooselocation" +
        "?response_type=code" +
        "&redirect_uri=https%3A%2F%2Fapi.yourdomain.com%2Fghl%2Foauth%2Fcallback" +
        "&client_id=65f0a1b2c3d4e5f6a7b8c9d0-public" +
        "&scope=contacts.readonly%20contacts.write%20conversations.readonly%20conversations.write%20conversations%2Fmessage.write%20opportunities.readonly%20opportunities.write%20workflows.readonly%20locations.readonly",
      redirectUri: "https://api.yourdomain.com/ghl/oauth/callback",
      scopes:
        "contacts.readonly contacts.write conversations.readonly conversations.write conversations/message.write opportunities.readonly opportunities.write workflows.readonly locations.readonly",
    },

    api: {
      base: "https://services.leadconnectorhq.com",
      version: "2021-07-28",
      tokenUrl: "https://services.leadconnectorhq.com/oauth/token",
      authBaseUrl: "https://marketplace.gohighlevel.com/oauth/chooselocation",
    },

    webhook: {
      targetUrl: "https://api.yourdomain.com/ghl/webhooks",
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
