#!/usr/bin/env node
// Lightweight static validation for the Soul Prosperity Command Center.
// - Verifies referenced local asset files exist (from index.html href/src)
// - Verifies forbidden browser storage APIs are not used in client JS

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const indexPath = path.join(repoRoot, "index.html");
const configPath = path.join(repoRoot, "config.js");

const errors = [];
const warnings = [];

function read(file) {
  return fs.readFileSync(file, "utf8");
}

// Required structure for window.SP_CONFIG.ghl. Missing KEYS in the
// schema are hard errors (means config.js has been malformed and the
// dashboard's GHL panel will break). Placeholder VALUES are launch
// warnings — config.js with placeholders is still a valid dev/build
// artifact, just not production-ready.
const GHL_SCHEMA = {
  required: [
    "ghl.locationId",
    "ghl.dashboardUrl",
    "ghl.workflowsUrl",
    "ghl.campaignsUrl",
    "ghl.contactsUrl",
    "ghl.opportunitiesUrl",
    "ghl.conversationsUrl",
    "ghl.analyticsUrl",
    "ghl.calendarBookingUrl",
    "ghl.oauth.clientId",
    "ghl.oauth.installUrl",
    "ghl.oauth.redirectUri",
    "ghl.oauth.scopes",
    "ghl.api.base",
    "ghl.api.version",
    "ghl.api.tokenUrl",
    "ghl.api.authBaseUrl",
    "ghl.webhook.targetUrl",
    "ghl.webhook.events",
  ],
  // These are the values that block production launch when still
  // placeholder. Reported as warnings, not errors, so CI keeps passing.
  productionRequired: [
    "ghl.locationId",
    "ghl.oauth.clientId",
    "ghl.oauth.installUrl",
    "ghl.oauth.redirectUri",
    "ghl.webhook.targetUrl",
  ],
};

function isPlaceholder(value) {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === "#") return true;
  if (trimmed.toUpperCase().startsWith("REPLACE_")) return true;
  return false;
}

function loadConfig() {
  // config.js is plain JS that assigns window.SP_CONFIG. Evaluate it
  // in a controlled scope with a stub `window` so we can inspect the
  // structure without a browser. The file is checked into the repo
  // and trusted; this is not a sandbox boundary.
  const src = read(configPath);
  const sandboxWindow = {};
  // eslint-disable-next-line no-new-func
  const fn = new Function("window", src);
  fn(sandboxWindow);
  return sandboxWindow.SP_CONFIG || {};
}

function getPath(obj, dottedPath) {
  const parts = String(dottedPath).split(".");
  let cur = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}

function checkGhlConfig() {
  if (!fs.existsSync(configPath)) {
    errors.push("config.js not found at repo root");
    return;
  }
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    errors.push(`config.js failed to load: ${err.message}`);
    return;
  }
  if (!config.ghl || typeof config.ghl !== "object") {
    errors.push("config.js: SP_CONFIG.ghl is missing — re-run from the template in docs/GHL_SETUP.md");
    return;
  }
  for (const key of GHL_SCHEMA.required) {
    const value = getPath(config, key);
    if (value === undefined) {
      errors.push(`config.js: SP_CONFIG.${key} is missing (schema key not present)`);
    }
  }
  for (const key of GHL_SCHEMA.productionRequired) {
    const value = getPath(config, key);
    if (isPlaceholder(value)) {
      warnings.push(`SP_CONFIG.${key} is a placeholder — required before production launch`);
    }
  }
}

function checkReferencedAssets() {
  if (!fs.existsSync(indexPath)) {
    errors.push("index.html not found at repo root");
    return;
  }
  const html = read(indexPath);
  const attrRegex = /(?:href|src)\s*=\s*"([^"]+)"/g;
  const seen = new Set();
  let match;
  while ((match = attrRegex.exec(html)) !== null) {
    const ref = match[1];
    if (!ref) continue;
    if (seen.has(ref)) continue;
    seen.add(ref);

    // Only validate local relative references. Skip URLs, anchors, data URIs.
    if (
      ref.startsWith("http://") ||
      ref.startsWith("https://") ||
      ref.startsWith("//") ||
      ref.startsWith("data:") ||
      ref.startsWith("mailto:") ||
      ref.startsWith("#")
    ) {
      continue;
    }

    const cleaned = ref.split("#")[0].split("?")[0];
    if (!cleaned) continue;
    const resolved = path.resolve(repoRoot, cleaned);
    if (!fs.existsSync(resolved)) {
      errors.push(`Missing local asset referenced in index.html: ${ref}`);
    }
  }
}

function checkForbiddenBrowserApis() {
  const jsFiles = ["app.js", "config.js"];
  const forbidden = ["localStorage", "sessionStorage", "indexedDB", "document.cookie"];
  for (const rel of jsFiles) {
    const full = path.join(repoRoot, rel);
    if (!fs.existsSync(full)) continue;
    const src = read(full);
    for (const token of forbidden) {
      if (src.includes(token)) {
        errors.push(`Forbidden browser storage API '${token}' found in ${rel}`);
      }
    }
  }
}

function checkRequiredFiles() {
  const required = ["index.html", "styles.css", "app.js", "config.js"];
  for (const rel of required) {
    if (!fs.existsSync(path.join(repoRoot, rel))) {
      errors.push(`Required file missing: ${rel}`);
    }
  }
}

// Launch-critical operator assets. These are the files the dashboard
// links to from the Launch Blueprint section and the asset dock; if
// any one of them is missing the static site will 404 in production.
// Treated as hard errors (not warnings) because they're the difference
// between "operator can launch" and "operator opens a broken link".
const LAUNCH_BLUEPRINT_ASSETS = [
  "source-assets/launch-blueprint.html",
  "source-assets/funnel-map.html",
  "source-assets/paid-traffic-plan.html",
  "source-assets/content-engine-plan.html",
  "source-assets/email-sms-sequences.html",
  "source-assets/ad-copy-swipe-file.html",
  "source-assets/tracking-spec.html",
  "source-assets/ghl-automation-sequences.html",
  "source-assets/preflight-qa.html",
  "source-assets/launch-day-runbook.html",
  "source-assets/social-content-pack.html",
  "source-assets/launch-checklist.html",
  "source-assets/sales-page-7-ebook.html",
  "source-assets/soul-prosperity-wealth-report-v2.html",
  "docs/GHL_SETUP.md",
  "docs/LAUNCH_BLUEPRINT.md",
];

function checkLaunchBlueprintAssets() {
  for (const rel of LAUNCH_BLUEPRINT_ASSETS) {
    if (!fs.existsSync(path.join(repoRoot, rel))) {
      errors.push(`Launch blueprint asset missing: ${rel}`);
    }
  }
}

// Serverless layer: routes under api/ghl/* are Vercel Node functions.
// We don't execute them here, but we do enforce: (1) syntax via
// require-with-stub, (2) shape — each route exports a function, (3)
// no client-side secret leakage (i.e. no `window.SP_CONFIG = ...`
// assignments and no `localStorage`/`sessionStorage` usage in the
// server code, which would indicate confused-deputy code), and (4)
// production launch warnings for missing env vars when running in CI
// with the relevant env present.
const SERVERLESS_ROUTES = [
  {
    file: "api/ghl/health.js",
    expectsFunction: true,
  },
  {
    file: "api/ghl/oauth/callback.js",
    expectsFunction: true,
  },
  {
    file: "api/ghl/webhook.js",
    expectsFunction: true,
  },
  {
    file: "api/_lib/ghl.js",
    expectsFunction: false,
  },
];

// NOTE: GHL_WEBHOOK_SIGNING_SECRET is intentionally absent. HighLevel
// webhook signature verification uses public-key crypto (Ed25519
// current, RSA-SHA256 legacy). The public keys are baked into
// api/_lib/ghl.js and require no env secret to function.
const SERVER_ENV_LAUNCH = [
  "GHL_CLIENT_ID",
  "GHL_CLIENT_SECRET",
  "GHL_OAUTH_REDIRECT_URI",
  // GHL_TOKEN_STORAGE_URL handled separately below — KV is an alternative.
];

function checkServerlessRoutes() {
  const forbiddenInServer = [
    "window.SP_CONFIG",
    "localStorage",
    "sessionStorage",
    "document.cookie",
  ];
  for (const route of SERVERLESS_ROUTES) {
    const full = path.join(repoRoot, route.file);
    if (!fs.existsSync(full)) {
      errors.push(`Serverless route missing: ${route.file}`);
      continue;
    }
    const src = read(full);
    for (const token of forbiddenInServer) {
      if (src.includes(token)) {
        errors.push(
          `Forbidden client API '${token}' found in server file ${route.file}`
        );
      }
    }
    let mod;
    try {
      // Clear cache so repeated runs reflect edits.
      delete require.cache[require.resolve(full)];
      mod = require(full);
    } catch (err) {
      errors.push(`Serverless route failed to load (${route.file}): ${err.message}`);
      continue;
    }
    if (route.expectsFunction && typeof mod !== "function") {
      errors.push(
        `Serverless route ${route.file} must module.exports a (req, res) handler function`
      );
    }
  }
}

function checkServerEnvLaunch() {
  for (const name of SERVER_ENV_LAUNCH) {
    const v = process.env[name];
    if (!v || !String(v).trim()) {
      warnings.push(
        `Server env ${name} is unset — required in production Vercel project before live OAuth/webhook traffic`
      );
    }
  }
  // Token storage: either Vercel KV (preferred) or GHL_TOKEN_STORAGE_URL.
  // Vercel injects KV_REST_API_URL + KV_REST_API_TOKEN automatically when
  // a KV store is connected (Project -> Storage -> Connect KV Store).
  const hasKv =
    !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_URL.trim()) &&
    !!(process.env.KV_REST_API_TOKEN && process.env.KV_REST_API_TOKEN.trim());
  const hasUrl =
    !!(process.env.GHL_TOKEN_STORAGE_URL &&
      process.env.GHL_TOKEN_STORAGE_URL.trim());
  if (!hasKv && !hasUrl) {
    warnings.push(
      "Server env GHL_TOKEN_STORAGE_URL is unset — required in production Vercel project before live OAuth/webhook traffic" +
        " (alternatively, connect a Vercel KV store so KV_REST_API_URL and KV_REST_API_TOKEN are injected automatically)"
    );
  }
}

checkRequiredFiles();
checkLaunchBlueprintAssets();
checkReferencedAssets();
checkForbiddenBrowserApis();
checkGhlConfig();
checkServerlessRoutes();
checkServerEnvLaunch();

if (errors.length > 0) {
  console.error("Validation failed:");
  for (const e of errors) console.error(` - ${e}`);
  if (warnings.length > 0) {
    console.error("Launch warnings (production blockers, not build failures):");
    for (const w of warnings) console.error(` ! ${w}`);
  }
  process.exit(1);
}

console.log("Validation passed: required files present, local assets resolved, no forbidden browser storage APIs, GHL schema intact.");
if (warnings.length > 0) {
  console.log("");
  console.log(`Launch checklist warnings (${warnings.length}) — must be resolved before production traffic, but do not fail the build:`);
  for (const w of warnings) console.log(` ! ${w}`);
}
