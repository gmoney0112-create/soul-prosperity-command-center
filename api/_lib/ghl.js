// Shared utilities for the GoHighLevel serverless layer.
//
// This module is loaded by every function under api/ghl/. It must
// stay dependency-free so it runs on Vercel's Node serverless runtime
// without a build step. Anything that needs a third-party package
// belongs behind an explicit feature flag.

"use strict";

const crypto = require("crypto");

const DEFAULT_ALLOWED_EVENTS = [
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
];

const TOKEN_URL = "https://services.leadconnectorhq.com/oauth/token";

// Best-effort in-memory webhook id cache for dev. Vercel serverless
// instances are short-lived and not shared across invocations, so this
// is NOT a durable de-dup. Production must back this with Redis / KV.
const seenWebhookIds = new Map();
const WEBHOOK_DEDUP_TTL_MS = 24 * 60 * 60 * 1000;
const WEBHOOK_DEDUP_MAX = 5000;

function jsonResponse(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function methodNotAllowed(res, allowed) {
  res.setHeader("Allow", allowed.join(", "));
  return jsonResponse(res, 405, {
    ok: false,
    error: "method_not_allowed",
    allowed,
  });
}

// Read the request body as a Buffer. Vercel may pre-parse JSON bodies
// when content-type is application/json; we always read the raw stream
// because webhook signature verification needs the exact bytes.
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    if (req.rawBody && Buffer.isBuffer(req.rawBody)) {
      return resolve(req.rawBody);
    }
    const chunks = [];
    let total = 0;
    const MAX = 1 * 1024 * 1024; // 1MB cap; webhooks are small
    req.on("data", (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > MAX) {
        reject(new Error("payload_too_large"));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function safeJsonParse(buf) {
  if (!buf || buf.length === 0) return null;
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch (_err) {
    return null;
  }
}

function isPlaceholder(value) {
  if (value == null) return true;
  const trimmed = String(value).trim();
  if (!trimmed) return true;
  if (trimmed === "#") return true;
  if (trimmed.toUpperCase().startsWith("REPLACE_")) return true;
  return false;
}

function readEnv(name) {
  const v = process.env[name];
  if (v == null) return "";
  return String(v).trim();
}

function getAllowedEvents() {
  const raw = readEnv("GHL_ALLOWED_WEBHOOK_EVENTS");
  if (!raw) return DEFAULT_ALLOWED_EVENTS.slice();
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function getOAuthConfig() {
  return {
    clientId: readEnv("GHL_CLIENT_ID"),
    clientSecret: readEnv("GHL_CLIENT_SECRET"),
    redirectUri: readEnv("GHL_OAUTH_REDIRECT_URI"),
    userType: readEnv("GHL_USER_TYPE") || "Location",
    tokenStorageUrl: readEnv("GHL_TOKEN_STORAGE_URL"),
  };
}

function getWebhookConfig() {
  return {
    signingSecret: readEnv("GHL_WEBHOOK_SIGNING_SECRET"),
    forwardUrl: readEnv("GHL_WEBHOOK_FORWARD_URL"),
    allowedEvents: getAllowedEvents(),
  };
}

// Timing-safe HMAC-SHA256 hex compare. Returns false if the secret is
// empty (signature verification disabled), so callers must check that
// case explicitly before treating the result as "verified".
function verifySignature(rawBody, signatureHeader, secret) {
  if (!secret) return false;
  if (!signatureHeader) return false;
  const sig = String(signatureHeader).trim();
  if (!sig) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch (_err) {
    return false;
  }
}

// Best-effort, in-memory de-dup. Returns true if this is the first
// time we have seen the id (record it), false if it is a duplicate.
function recordWebhookId(id) {
  if (!id) return true; // can't de-dup without an id; let it through
  const now = Date.now();
  // Sweep stale entries opportunistically.
  if (seenWebhookIds.size > WEBHOOK_DEDUP_MAX) {
    for (const [k, ts] of seenWebhookIds) {
      if (now - ts > WEBHOOK_DEDUP_TTL_MS) seenWebhookIds.delete(k);
    }
    // If still over after TTL sweep, drop oldest insertions.
    while (seenWebhookIds.size > WEBHOOK_DEDUP_MAX) {
      const oldestKey = seenWebhookIds.keys().next().value;
      if (oldestKey === undefined) break;
      seenWebhookIds.delete(oldestKey);
    }
  }
  if (seenWebhookIds.has(id)) {
    const ts = seenWebhookIds.get(id);
    if (now - ts <= WEBHOOK_DEDUP_TTL_MS) return false;
  }
  seenWebhookIds.set(id, now);
  return true;
}

// Sanitize an object for logging — strips known secret-bearing keys and
// any token-like values. Used both in webhook logging and OAuth ops.
const SECRET_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /authorization/i,
  /password/i,
  /api[_-]?key/i,
];

function sanitizeForLog(value, depth) {
  const d = typeof depth === "number" ? depth : 0;
  if (d > 5) return "[depth_limited]";
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((v) => sanitizeForLog(v, d + 1));
  if (typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value)) {
      if (SECRET_KEY_PATTERNS.some((re) => re.test(k))) {
        out[k] = "[redacted]";
      } else {
        out[k] = sanitizeForLog(value[k], d + 1);
      }
    }
    return out;
  }
  return value;
}

function logSafe(label, payload) {
  try {
    // eslint-disable-next-line no-console
    console.log(label, JSON.stringify(sanitizeForLog(payload)));
  } catch (_err) {
    // eslint-disable-next-line no-console
    console.log(label, "[unloggable_payload]");
  }
}

// Forward a payload to an operator-configured sink with a short
// timeout. Never throw — forwarding failures are logged, not surfaced
// to the upstream caller (HighLevel webhook delivery, OAuth callback).
async function forwardJson(url, payload, headers) {
  if (!url) return { ok: false, skipped: true };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: Object.assign(
        { "Content-Type": "application/json" },
        headers || {}
      ),
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    return { ok: resp.ok, status: resp.status };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : "forward_failed" };
  } finally {
    clearTimeout(timer);
  }
}

// POST application/x-www-form-urlencoded — used for the GHL token
// exchange. Returns parsed JSON or throws with a stable shape.
async function postForm(url, params) {
  const body = new URLSearchParams();
  for (const k of Object.keys(params)) {
    if (params[k] == null) continue;
    body.append(k, String(params[k]));
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 10000);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
      signal: ac.signal,
    });
    const text = await resp.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (_err) {
      json = null;
    }
    return { ok: resp.ok, status: resp.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

// Operator-readiness summary used by /api/ghl/health. Mirrors the
// production-required keys in scripts/validate.js, but scoped to the
// SERVER side: only env-var presence is reported, never values.
function readinessSummary() {
  const oauth = getOAuthConfig();
  const wh = getWebhookConfig();
  return {
    oauth: {
      clientId: !isPlaceholder(oauth.clientId),
      clientSecret: !isPlaceholder(oauth.clientSecret),
      redirectUri: !isPlaceholder(oauth.redirectUri),
      userType: oauth.userType || "Location",
      tokenStorageConfigured: !isPlaceholder(oauth.tokenStorageUrl),
    },
    webhook: {
      signatureVerification: !isPlaceholder(wh.signingSecret),
      forwardConfigured: !isPlaceholder(wh.forwardUrl),
      allowedEvents: wh.allowedEvents,
    },
  };
}

module.exports = {
  TOKEN_URL,
  DEFAULT_ALLOWED_EVENTS,
  jsonResponse,
  methodNotAllowed,
  readRawBody,
  safeJsonParse,
  isPlaceholder,
  readEnv,
  getAllowedEvents,
  getOAuthConfig,
  getWebhookConfig,
  verifySignature,
  recordWebhookId,
  sanitizeForLog,
  logSafe,
  forwardJson,
  postForm,
  readinessSummary,
};
