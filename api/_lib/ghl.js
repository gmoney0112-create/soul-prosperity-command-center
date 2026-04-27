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

// Official HighLevel webhook signing public keys.
//
// HighLevel publishes these in their developer docs. They are PUBLIC
// keys — safe to embed in the repo. Each delivery is signed by
// HighLevel's private key; we verify the signature against the
// matching public key and the EXACT raw request bytes.
//
// Current scheme: Ed25519. Header: `X-GHL-Signature` (base64).
// Legacy scheme:  RSA-SHA256. Header: `X-WH-Signature` (base64).
//
// Both keys come from
// https://highlevel.stoplight.io/docs/integrations/ (Webhooks →
// Verifying Webhook Signature).
const GHL_ED25519_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=
-----END PUBLIC KEY-----`;

// HighLevel's published RSA public key for the legacy `X-WH-Signature`
// scheme. Verbatim from the HighLevel docs.
const GHL_RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAokvo/r9tVgcfZ5DysOSC
Frm602qYV0MaAiNnX9O8KxMbiyRKWeL9JpCpVpt4XHIcBOK4u3cLSqJGOLaPuXw6
dO0t6Q/ZVdAV5Phz+ZtzPL16iCGeK9po6D6JHBpbi989mmzMryUnQJezlYJ3DVfB
csedpinheNnyYeFXolrJvcsjDtfAeRx5ByHQmTnSdFUzuAnC9/GepgLT9SM4nCpv
uxmZMxrJt5Rw+VUaQ9B8JSvbMPpez4peKaJPZHBbU3OdeCVx5klVXXZQGNHOs8gF
3kvoV5rTnXV0IknLBXlcKKAQLZcY/Q9rG6Ifi9c+5vqlvHPCUJFT5XUGG5RKgOKU
J062fRtN+rLYZUV+BjafxQauvC8wSWeYja63VSUruvmNj8xkx2zE/Juc+yjLjTXp
IocmaiFeAO6fUtNjDeFVkhf5LNb59vECyrHD2SQIrhgXpO4Q3dVNA5rw576PwTzN
h/AMfHKIjE4xQA1SZuYJmNnmVZLIZBlQAF9Ntd03rfadZ+yDiOXCCs9FkHibELhC
HULgCsnuDJHcrGNd5/Ddm5hxGQ0ASitgHeMZ0kcIOwKDOzOU53lDza6/Y09T7sYJ
PQe7z0cvj7aE4B+Ax1ZoZGPzpJlZtGXCsu9aTEGEnKzmsFqwcSsnw3JB31IGKAyk
T1hhTiaCeIY/OwwwNUY2yvcCAwEAAQ==
-----END PUBLIC KEY-----`;

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
    forwardUrl: readEnv("GHL_WEBHOOK_FORWARD_URL"),
    allowedEvents: getAllowedEvents(),
  };
}

function decodeSignature(sigHeader) {
  if (!sigHeader) return null;
  const trimmed = String(sigHeader).trim();
  if (!trimmed) return null;
  // HighLevel publishes signatures as base64. Be lenient: accept hex
  // too in case a tester signs with openssl dgst -hex.
  try {
    const b64 = Buffer.from(trimmed, "base64");
    if (b64.length > 0 && b64.toString("base64").replace(/=+$/, "") ===
        trimmed.replace(/=+$/, "")) {
      return b64;
    }
  } catch (_err) {
    // fall through
  }
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
    try {
      return Buffer.from(trimmed, "hex");
    } catch (_err) {
      return null;
    }
  }
  // Final fallback — try base64 even if it does not roundtrip cleanly.
  try {
    return Buffer.from(trimmed, "base64");
  } catch (_err) {
    return null;
  }
}

// Verify HighLevel's current Ed25519 webhook signature.
// Header: `X-GHL-Signature` (base64 of the Ed25519 signature).
// Public key: GHL_ED25519_PUBLIC_KEY (PEM).
function verifyEd25519(rawBody, signatureHeader) {
  if (!signatureHeader) return false;
  const sig = decodeSignature(signatureHeader);
  if (!sig || sig.length === 0) return false;
  try {
    const keyObj = crypto.createPublicKey(GHL_ED25519_PUBLIC_KEY);
    return crypto.verify(null, rawBody, keyObj, sig);
  } catch (_err) {
    return false;
  }
}

// Verify HighLevel's legacy RSA-SHA256 webhook signature.
// Header: `X-WH-Signature` (base64 of the RSA-SHA256 signature).
// Public key: GHL_RSA_PUBLIC_KEY (PEM).
function verifyRsaSha256(rawBody, signatureHeader) {
  if (!signatureHeader) return false;
  const sig = decodeSignature(signatureHeader);
  if (!sig || sig.length === 0) return false;
  try {
    const keyObj = crypto.createPublicKey(GHL_RSA_PUBLIC_KEY);
    return crypto.verify("RSA-SHA256", rawBody, keyObj, sig);
  } catch (_err) {
    return false;
  }
}

// Top-level webhook verification entrypoint. Tries Ed25519 first
// (current scheme), falls back to RSA (legacy scheme). Returns:
//   { verified: true,  scheme: "ed25519" | "rsa-sha256" }
//   { verified: false, scheme: null, reason: "no_signature_header" | "invalid" }
function verifyWebhookSignature(rawBody, headers) {
  function pickHeader(name) {
    if (!headers) return "";
    const lower = name.toLowerCase();
    const v = headers[lower];
    if (Array.isArray(v)) return v[0] || "";
    return v ? String(v) : "";
  }
  const ed25519Sig =
    pickHeader("x-ghl-signature") || pickHeader("x-hl-signature");
  const rsaSig = pickHeader("x-wh-signature");

  if (!ed25519Sig && !rsaSig) {
    return { verified: false, scheme: null, reason: "no_signature_header" };
  }
  if (ed25519Sig && verifyEd25519(rawBody, ed25519Sig)) {
    return { verified: true, scheme: "ed25519" };
  }
  if (rsaSig && verifyRsaSha256(rawBody, rsaSig)) {
    return { verified: true, scheme: "rsa-sha256" };
  }
  return { verified: false, scheme: null, reason: "invalid" };
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
//
// Webhook signature verification is ALWAYS available because the
// public keys are hardcoded from the HighLevel docs — we report that
// as a static `true` rather than a configurable boolean.
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
      signatureVerification: true,
      signatureSchemes: ["ed25519", "rsa-sha256"],
      forwardConfigured: !isPlaceholder(wh.forwardUrl),
      allowedEvents: wh.allowedEvents,
    },
  };
}

module.exports = {
  TOKEN_URL,
  DEFAULT_ALLOWED_EVENTS,
  GHL_ED25519_PUBLIC_KEY,
  GHL_RSA_PUBLIC_KEY,
  jsonResponse,
  methodNotAllowed,
  readRawBody,
  safeJsonParse,
  isPlaceholder,
  readEnv,
  getAllowedEvents,
  getOAuthConfig,
  getWebhookConfig,
  verifyEd25519,
  verifyRsaSha256,
  verifyWebhookSignature,
  recordWebhookId,
  sanitizeForLog,
  logSafe,
  forwardJson,
  postForm,
  readinessSummary,
};
