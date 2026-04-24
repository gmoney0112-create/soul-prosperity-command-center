// Central configuration for all external destinations used by the
// Soul Prosperity Funnel Command Center.
//
// Replace every "#" placeholder with the real URL as each piece of the
// funnel goes live. The Launch Links panel in the UI reads this file
// and flags which links are still placeholders vs. ready.
//
// A value is considered a placeholder if it is empty, "#", or starts
// with "REPLACE_". Anything else is treated as ready.

window.SP_CONFIG = {
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

  // Operations tooling
  ghlDashboard: "#",
  ghlWorkflows: "#",
  analytics: "#",

  // Public bio link used across social profiles
  socialBioLink: "#",
};
