#!/usr/bin/env node
// Lightweight smoke tests for the GHL serverless handlers. Runs each
// handler in-process against a mocked req/res so we don't need to
// boot Vercel locally. Exits 0 on success, 1 on any failed assertion.
//
// Webhook signature verification uses HighLevel's published public
// keys (Ed25519 current, RSA-SHA256 legacy) baked into api/_lib/ghl.js.
// We test the verification path by monkey-patching the public keys to
// match a key pair we generate locally — that proves the wiring,
// without needing HighLevel's private key.

"use strict";

const crypto = require("crypto");
const path = require("path");
const { Readable } = require("stream");

const repoRoot = path.resolve(__dirname, "..");
const ghlLibPath = path.join(repoRoot, "api/_lib/ghl.js");

// Generate a local Ed25519 key pair and a local RSA key pair, then
// override the constants exported by api/_lib/ghl.js so the handler
// verifies against keys whose private side we control.
const ed = crypto.generateKeyPairSync("ed25519");
const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });

const ED_PUBLIC_PEM = ed.publicKey.export({ type: "spki", format: "pem" });
const RSA_PUBLIC_PEM = rsa.publicKey.export({ type: "spki", format: "pem" });

// Patch the module BEFORE requiring downstream handlers. The library
// reads its key constants at call time via the closure, so reassigning
// the exported strings would be a no-op. Instead, we re-`require` the
// library, mutate its internal verifiers to use our test keys.
const ghlLib = require(ghlLibPath);

function ed25519Sign(rawBody) {
  return crypto.sign(null, rawBody, ed.privateKey);
}
function rsaSha256Sign(rawBody) {
  return crypto.sign("RSA-SHA256", rawBody, rsa.privateKey);
}

// Replace the verifier functions on the exported module so the webhook
// handler — which closes over the module exports via destructuring —
// validates against our test keys instead of HighLevel's.
ghlLib.verifyEd25519 = function (rawBody, sigHeader) {
  if (!sigHeader) return false;
  let sig;
  try {
    sig = Buffer.from(String(sigHeader).trim(), "base64");
  } catch (_err) {
    return false;
  }
  if (!sig.length) return false;
  try {
    return crypto.verify(null, rawBody, ed.publicKey, sig);
  } catch (_err) {
    return false;
  }
};
ghlLib.verifyRsaSha256 = function (rawBody, sigHeader) {
  if (!sigHeader) return false;
  let sig;
  try {
    sig = Buffer.from(String(sigHeader).trim(), "base64");
  } catch (_err) {
    return false;
  }
  if (!sig.length) return false;
  try {
    return crypto.verify("RSA-SHA256", rawBody, rsa.publicKey, sig);
  } catch (_err) {
    return false;
  }
};
// Re-implement the top-level verifier in terms of the patched
// per-scheme verifiers, mirroring the production behaviour.
ghlLib.verifyWebhookSignature = function (rawBody, headers) {
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
  if (ed25519Sig && ghlLib.verifyEd25519(rawBody, ed25519Sig)) {
    return { verified: true, scheme: "ed25519" };
  }
  if (rsaSig && ghlLib.verifyRsaSha256(rawBody, rsaSig)) {
    return { verified: true, scheme: "rsa-sha256" };
  }
  return { verified: false, scheme: null, reason: "invalid" };
};

const healthHandler = require(path.join(repoRoot, "api/ghl/health.js"));
const oauthHandler = require(path.join(repoRoot, "api/ghl/oauth/callback.js"));
const webhookHandler = require(path.join(repoRoot, "api/ghl/webhook.js"));

let failed = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  ok  - ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL - ${label}`);
  }
}

function makeRes() {
  const headers = {};
  let statusCode = 200;
  let body = "";
  const res = {
    statusCode,
    setHeader(k, v) {
      headers[k.toLowerCase()] = v;
    },
    getHeader(k) {
      return headers[k.toLowerCase()];
    },
    end(chunk) {
      body = chunk == null ? "" : String(chunk);
      this._done = true;
    },
  };
  Object.defineProperty(res, "headers", { get: () => headers });
  Object.defineProperty(res, "body", { get: () => body });
  Object.defineProperty(res, "status", { get: () => res.statusCode });
  return res;
}

function makeReq({ method, url, headers, body }) {
  const buf = body == null ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(body);
  const stream = Readable.from(buf.length ? [buf] : []);
  stream.method = method || "GET";
  stream.url = url || "/";
  stream.headers = Object.assign({}, headers || {});
  return stream;
}

async function run(name, fn) {
  console.log(`\n# ${name}`);
  try {
    await fn();
  } catch (err) {
    failed += 1;
    console.error(`  THREW - ${err && err.stack ? err.stack : err}`);
  }
}

(async () => {
  // ── /api/ghl/health ────────────────────────────────────────────
  await run("health: GET returns 200 and readiness shape", async () => {
    const req = makeReq({ method: "GET", url: "/api/ghl/health" });
    const res = makeRes();
    await healthHandler(req, res);
    assert(res.status === 200, "status 200");
    const json = JSON.parse(res.body);
    assert(json.ok === true, "ok=true");
    assert(json.service === "soul-prosperity-ghl", "service id present");
    assert(typeof json.ready === "object", "ready block present");
    assert(typeof json.config === "object", "config block present");
    assert(json.ready.webhook === true, "ready.webhook=true (built-in keys)");
    assert(
      Array.isArray(json.config.webhook.allowedEvents),
      "allowedEvents is an array"
    );
    assert(
      Array.isArray(json.config.webhook.signatureSchemes) &&
        json.config.webhook.signatureSchemes.includes("ed25519") &&
        json.config.webhook.signatureSchemes.includes("rsa-sha256"),
      "advertises both signature schemes"
    );
    // Must NOT leak any env values.
    assert(!res.body.includes("super-secret"), "no secret leak");
  });

  await run("health: POST returns 405", async () => {
    const req = makeReq({ method: "POST", url: "/api/ghl/health" });
    const res = makeRes();
    await healthHandler(req, res);
    assert(res.status === 405, "status 405");
  });

  await run("health: oauth=false when credentials set but no storage", async () => {
    process.env.GHL_CLIENT_ID = "test-client-id";
    process.env.GHL_CLIENT_SECRET = "test-secret";
    process.env.GHL_OAUTH_REDIRECT_URI = "https://example.com/api/ghl/oauth/callback";
    delete process.env.GHL_TOKEN_STORAGE_URL;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    try {
      const req = makeReq({ method: "GET", url: "/api/ghl/health" });
      const res = makeRes();
      await healthHandler(req, res);
      const json = JSON.parse(res.body);
      assert(json.ready.oauth === false, "oauth=false without storage");
      assert(json.config.oauth.tokenStorageConfigured === false, "tokenStorageConfigured=false");
      assert(json.config.oauth.tokenStorageBackend === "none", "tokenStorageBackend=none");
    } finally {
      delete process.env.GHL_CLIENT_ID;
      delete process.env.GHL_CLIENT_SECRET;
      delete process.env.GHL_OAUTH_REDIRECT_URI;
    }
  });

  await run("health: oauth=true when credentials + URL storage configured", async () => {
    process.env.GHL_CLIENT_ID = "test-client-id";
    process.env.GHL_CLIENT_SECRET = "test-secret";
    process.env.GHL_OAUTH_REDIRECT_URI = "https://example.com/api/ghl/oauth/callback";
    process.env.GHL_TOKEN_STORAGE_URL = "https://sink.example.com/ghl/tokens";
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    try {
      const req = makeReq({ method: "GET", url: "/api/ghl/health" });
      const res = makeRes();
      await healthHandler(req, res);
      const json = JSON.parse(res.body);
      assert(json.ready.oauth === true, "oauth=true with URL storage");
      assert(json.config.oauth.tokenStorageConfigured === true, "tokenStorageConfigured=true");
      assert(json.config.oauth.tokenStorageBackend === "url", "tokenStorageBackend=url");
    } finally {
      delete process.env.GHL_CLIENT_ID;
      delete process.env.GHL_CLIENT_SECRET;
      delete process.env.GHL_OAUTH_REDIRECT_URI;
      delete process.env.GHL_TOKEN_STORAGE_URL;
    }
  });

  await run("health: oauth=true when credentials + KV env vars configured", async () => {
    process.env.GHL_CLIENT_ID = "test-client-id";
    process.env.GHL_CLIENT_SECRET = "test-secret";
    process.env.GHL_OAUTH_REDIRECT_URI = "https://example.com/api/ghl/oauth/callback";
    delete process.env.GHL_TOKEN_STORAGE_URL;
    process.env.KV_REST_API_URL = "https://kv.upstash.io/abc123";
    process.env.KV_REST_API_TOKEN = "kv-token-xyz";
    try {
      const req = makeReq({ method: "GET", url: "/api/ghl/health" });
      const res = makeRes();
      await healthHandler(req, res);
      const json = JSON.parse(res.body);
      assert(json.ready.oauth === true, "oauth=true with KV storage");
      assert(json.config.oauth.tokenStorageConfigured === true, "tokenStorageConfigured=true");
      assert(json.config.oauth.tokenStorageBackend === "vercel-kv", "tokenStorageBackend=vercel-kv");
    } finally {
      delete process.env.GHL_CLIENT_ID;
      delete process.env.GHL_CLIENT_SECRET;
      delete process.env.GHL_OAUTH_REDIRECT_URI;
      delete process.env.KV_REST_API_URL;
      delete process.env.KV_REST_API_TOKEN;
    }
  });

  // ── /api/ghl/oauth/callback ────────────────────────────────────
  await run("oauth: missing env returns 500 server_not_configured", async () => {
    delete process.env.GHL_CLIENT_ID;
    delete process.env.GHL_CLIENT_SECRET;
    delete process.env.GHL_OAUTH_REDIRECT_URI;
    const req = makeReq({
      method: "GET",
      url: "/api/ghl/oauth/callback?code=abc",
    });
    const res = makeRes();
    await oauthHandler(req, res);
    assert(res.status === 500, "status 500");
    const json = JSON.parse(res.body);
    assert(json.error === "server_not_configured", "error code");
    assert(Array.isArray(json.missing) && json.missing.length === 3, "lists missing vars");
  });

  await run("oauth: missing code returns 400 missing_code", async () => {
    process.env.GHL_CLIENT_ID = "public-client-id";
    process.env.GHL_CLIENT_SECRET = "super-secret";
    process.env.GHL_OAUTH_REDIRECT_URI = "https://example.com/api/ghl/oauth/callback";
    const req = makeReq({ method: "GET", url: "/api/ghl/oauth/callback" });
    const res = makeRes();
    await oauthHandler(req, res);
    assert(res.status === 400, "status 400");
    const json = JSON.parse(res.body);
    assert(json.error === "missing_code", "error code");
  });

  await run("oauth: provider error param surfaces 400", async () => {
    const req = makeReq({
      method: "GET",
      url: "/api/ghl/oauth/callback?error=access_denied&error_description=user+canceled",
    });
    const res = makeRes();
    await oauthHandler(req, res);
    assert(res.status === 400, "status 400");
    const json = JSON.parse(res.body);
    assert(json.error === "marketplace_error", "marketplace error code");
    assert(json.provider_error === "access_denied", "provider_error preserved");
  });

  await run("oauth: token endpoint failure returns 502, never leaks secret", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: false,
      status: 401,
      text: async () => '{"error":"invalid_client"}',
    });
    try {
      const req = makeReq({
        method: "GET",
        url: "/api/ghl/oauth/callback?code=bad",
      });
      const res = makeRes();
      await oauthHandler(req, res);
      assert(res.status === 502, "status 502");
      const json = JSON.parse(res.body);
      assert(json.error === "token_exchange_rejected", "error code");
      assert(!res.body.includes("super-secret"), "client_secret never appears in body");
    } finally {
      global.fetch = originalFetch;
    }
  });

  await run("oauth: success without storage URL returns persisted=false", async () => {
    delete process.env.GHL_TOKEN_STORAGE_URL;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          access_token: "at_xyz",
          refresh_token: "rt_xyz",
          expires_in: 86399,
          scope: "contacts.readonly",
          locationId: "loc_1",
          companyId: "co_1",
          userId: "user_1",
        }),
    });
    try {
      const req = makeReq({
        method: "GET",
        url: "/api/ghl/oauth/callback?code=good",
      });
      const res = makeRes();
      await oauthHandler(req, res);
      assert(res.status === 200, "status 200");
      const json = JSON.parse(res.body);
      assert(json.installed === true, "installed=true");
      assert(json.persisted === false, "persisted=false");
      assert(typeof json.warning === "string", "warning string present");
      assert(json.location_id === "loc_1", "location_id surfaced");
      assert(!res.body.includes("at_xyz"), "access_token not in response");
      assert(!res.body.includes("rt_xyz"), "refresh_token not in response");
      assert(!res.body.includes("super-secret"), "client_secret not in response");
    } finally {
      global.fetch = originalFetch;
    }
  });

  await run("oauth: success with storage URL forwards bundle and acks persisted=true", async () => {
    process.env.GHL_TOKEN_STORAGE_URL = "https://sink.example.com/ghl/tokens";
    const seen = [];
    const originalFetch = global.fetch;
    global.fetch = async (url, init) => {
      if (url === "https://services.leadconnectorhq.com/oauth/token") {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              access_token: "at_xyz",
              refresh_token: "rt_xyz",
              expires_in: 86399,
              scope: "contacts.readonly",
              locationId: "loc_1",
            }),
        };
      }
      if (url === process.env.GHL_TOKEN_STORAGE_URL) {
        seen.push(JSON.parse(init.body));
        return { ok: true, status: 204, text: async () => "" };
      }
      throw new Error(`unexpected fetch ${url}`);
    };
    try {
      const req = makeReq({
        method: "GET",
        url: "/api/ghl/oauth/callback?code=good",
      });
      const res = makeRes();
      await oauthHandler(req, res);
      assert(res.status === 200, "status 200");
      const json = JSON.parse(res.body);
      assert(json.persisted === true, "persisted=true");
      assert(json.backend === "url", "backend=url");
      assert(seen.length === 1, "sink received exactly one POST");
      assert(seen[0].access_token === "at_xyz", "sink got access_token");
      assert(seen[0].refresh_token === "rt_xyz", "sink got refresh_token");
      assert(!res.body.includes("at_xyz"), "browser response still has no token");
    } finally {
      global.fetch = originalFetch;
      delete process.env.GHL_TOKEN_STORAGE_URL;
    }
  });

  await run("oauth: success with KV storage stores token, persisted=true, no token in response", async () => {
    delete process.env.GHL_TOKEN_STORAGE_URL;
    process.env.KV_REST_API_URL = "https://kv.upstash.io/abc123";
    process.env.KV_REST_API_TOKEN = "kv-token-xyz";
    const seen = [];
    const originalFetch = global.fetch;
    global.fetch = async (url, init) => {
      if (url === "https://services.leadconnectorhq.com/oauth/token") {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              access_token: "at_kv_xyz",
              refresh_token: "rt_kv_xyz",
              expires_in: 86399,
              scope: "contacts.readonly",
              locationId: "loc_kv_1",
            }),
        };
      }
      // KV pipeline call
      if (url.startsWith("https://kv.upstash.io")) {
        seen.push({ url, body: JSON.parse(init.body) });
        return { ok: true, status: 200, text: async () => '{"result":"OK"}' };
      }
      throw new Error("unexpected fetch " + url);
    };
    try {
      const req = makeReq({
        method: "GET",
        url: "/api/ghl/oauth/callback?code=good",
      });
      const res = makeRes();
      await oauthHandler(req, res);
      assert(res.status === 200, "status 200");
      const json = JSON.parse(res.body);
      assert(json.installed === true, "installed=true");
      assert(json.persisted === true, "persisted=true");
      assert(json.backend === "vercel-kv", "backend=vercel-kv");
      assert(seen.length === 1, "KV pipeline received exactly one call");
      const kvCmd = seen[0].body[0]; // first command in pipeline
      assert(kvCmd[0] === "SET", "KV command is SET");
      assert(
        typeof kvCmd[1] === "string" && kvCmd[1].startsWith("ghl:oauth:"),
        "KV key is deterministic ghl:oauth: prefix"
      );
      const stored = JSON.parse(kvCmd[2]);
      assert(stored.access_token === "at_kv_xyz", "KV stored access_token");
      assert(stored.refresh_token === "rt_kv_xyz", "KV stored refresh_token");
      assert(kvCmd[3] === "EX", "KV has EX expiry flag");
      assert(typeof kvCmd[4] === "number" && kvCmd[4] > 0, "KV TTL is positive");
      // Tokens must never appear in the browser response.
      assert(!res.body.includes("at_kv_xyz"), "browser response has no access_token");
      assert(!res.body.includes("rt_kv_xyz"), "browser response has no refresh_token");
      assert(!res.body.includes("super-secret"), "browser response has no client_secret");
    } finally {
      global.fetch = originalFetch;
      delete process.env.KV_REST_API_URL;
      delete process.env.KV_REST_API_TOKEN;
    }
  });

  await run("oauth: KV storage failure produces safe 502 with no token leak", async () => {
    delete process.env.GHL_TOKEN_STORAGE_URL;
    process.env.KV_REST_API_URL = "https://kv.upstash.io/abc123";
    process.env.KV_REST_API_TOKEN = "kv-token-xyz";
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      if (url === "https://services.leadconnectorhq.com/oauth/token") {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              access_token: "at_fail",
              refresh_token: "rt_fail",
              expires_in: 86399,
              locationId: "loc_fail",
            }),
        };
      }
      // KV endpoint returns 503
      return { ok: false, status: 503, text: async () => '{"error":"unavailable"}' };
    };
    try {
      const req = makeReq({
        method: "GET",
        url: "/api/ghl/oauth/callback?code=good",
      });
      const res = makeRes();
      await oauthHandler(req, res);
      assert(res.status === 502, "status 502 on KV failure");
      const json = JSON.parse(res.body);
      assert(json.ok === false, "ok=false");
      assert(json.error === "token_persistence_failed", "error code");
      assert(json.backend === "vercel-kv", "backend=vercel-kv in error");
      assert(!res.body.includes("at_fail"), "no access_token in error response");
      assert(!res.body.includes("rt_fail"), "no refresh_token in error response");
    } finally {
      global.fetch = originalFetch;
      delete process.env.KV_REST_API_URL;
      delete process.env.KV_REST_API_TOKEN;
    }
  });

  // ── /api/ghl/webhook ──────────────────────────────────────────
  function ed25519SignedReq(payloadObj, opts) {
    const o = opts || {};
    const raw = Buffer.from(JSON.stringify(payloadObj));
    const sig = ed25519Sign(raw);
    const sigB64 = o.badSig
      ? Buffer.concat([sig, Buffer.from([0])]).toString("base64")
      : sig.toString("base64");
    const headers = {
      "content-type": "application/json",
      "x-wh-id": o.id || "wh_" + crypto.randomBytes(6).toString("hex"),
    };
    if (!o.omitSignature) headers["x-ghl-signature"] = sigB64;
    return makeReq({
      method: "POST",
      url: "/api/ghl/webhook",
      headers,
      body: raw,
    });
  }

  function rsaSignedReq(payloadObj, opts) {
    const o = opts || {};
    const raw = Buffer.from(JSON.stringify(payloadObj));
    const sig = rsaSha256Sign(raw);
    const headers = {
      "content-type": "application/json",
      "x-wh-id": o.id || "wh_" + crypto.randomBytes(6).toString("hex"),
      "x-wh-signature": sig.toString("base64"),
    };
    return makeReq({
      method: "POST",
      url: "/api/ghl/webhook",
      headers,
      body: raw,
    });
  }

  await run("webhook: GET returns 405", async () => {
    const req = makeReq({ method: "GET", url: "/api/ghl/webhook" });
    const res = makeRes();
    await webhookHandler(req, res);
    assert(res.status === 405, "status 405");
  });

  await run("webhook: missing signature header rejected with 401", async () => {
    const raw = Buffer.from(JSON.stringify({ type: "ContactCreate" }));
    const req = makeReq({
      method: "POST",
      url: "/api/ghl/webhook",
      headers: { "content-type": "application/json" },
      body: raw,
    });
    const res = makeRes();
    await webhookHandler(req, res);
    assert(res.status === 401, "status 401");
    const json = JSON.parse(res.body);
    assert(json.error === "invalid_signature", "error code");
    assert(json.reason === "no_signature_header", "reason=no_signature_header");
  });

  await run("webhook: invalid Ed25519 signature rejected with 401", async () => {
    const req = ed25519SignedReq({ type: "ContactCreate" }, { badSig: true });
    const res = makeRes();
    await webhookHandler(req, res);
    assert(res.status === 401, "status 401");
    const json = JSON.parse(res.body);
    assert(json.error === "invalid_signature", "error code");
    assert(json.reason === "invalid", "reason=invalid");
  });

  await run("webhook: valid Ed25519 signature + allowed event accepted", async () => {
    delete process.env.GHL_WEBHOOK_FORWARD_URL;
    const req = ed25519SignedReq(
      { type: "ContactCreate", webhookId: "wh_one", contact: { email: "x@y.z" } },
      { id: "wh_one" }
    );
    const res = makeRes();
    await webhookHandler(req, res);
    assert(res.status === 200, "status 200");
    const json = JSON.parse(res.body);
    assert(json.accepted === true, "accepted=true");
    assert(json.type === "ContactCreate", "event type echoed");
    assert(json.signature_scheme === "ed25519", "scheme=ed25519");
    assert(json.forwarded.configured === false, "forwarded.configured=false");
  });

  await run("webhook: valid legacy RSA-SHA256 signature accepted", async () => {
    const req = rsaSignedReq(
      { type: "ContactCreate", webhookId: "wh_rsa1" },
      { id: "wh_rsa1" }
    );
    const res = makeRes();
    await webhookHandler(req, res);
    assert(res.status === 200, "status 200");
    const json = JSON.parse(res.body);
    assert(json.accepted === true, "accepted=true");
    assert(json.signature_scheme === "rsa-sha256", "scheme=rsa-sha256");
  });

  await run("webhook: duplicate id de-duplicated", async () => {
    const dupReq = ed25519SignedReq(
      { type: "ContactCreate", webhookId: "wh_one" },
      { id: "wh_one" }
    );
    const res = makeRes();
    await webhookHandler(dupReq, res);
    assert(res.status === 200, "status 200");
    const json = JSON.parse(res.body);
    assert(json.duplicate === true, "duplicate=true");
  });

  await run("webhook: event outside allowlist ignored with 200", async () => {
    process.env.GHL_ALLOWED_WEBHOOK_EVENTS = "ContactCreate";
    const req = ed25519SignedReq(
      { type: "OrderCreate", webhookId: "wh_orderx" },
      { id: "wh_orderx" }
    );
    const res = makeRes();
    await webhookHandler(req, res);
    assert(res.status === 200, "status 200");
    const json = JSON.parse(res.body);
    assert(json.ignored === true, "ignored=true");
    assert(json.reason === "event_not_in_allowlist", "reason set");
    delete process.env.GHL_ALLOWED_WEBHOOK_EVENTS;
  });

  await run("webhook: forwards to GHL_WEBHOOK_FORWARD_URL when set", async () => {
    process.env.GHL_WEBHOOK_FORWARD_URL = "https://sink.example.com/ghl/webhook";
    const seen = [];
    const originalFetch = global.fetch;
    global.fetch = async (url, init) => {
      seen.push({ url, body: JSON.parse(init.body) });
      return { ok: true, status: 202, text: async () => "" };
    };
    try {
      const req = ed25519SignedReq(
        { type: "OpportunityCreate", webhookId: "wh_opp1" },
        { id: "wh_opp1" }
      );
      const res = makeRes();
      await webhookHandler(req, res);
      assert(res.status === 200, "status 200");
      const json = JSON.parse(res.body);
      assert(json.forwarded.configured === true, "forwarded.configured=true");
      assert(json.forwarded.delivered === true, "delivered=true");
      assert(seen.length === 1 && seen[0].body.type === "OpportunityCreate", "sink got payload");
      assert(seen[0].body.signature_scheme === "ed25519", "sink received scheme");
    } finally {
      global.fetch = originalFetch;
      delete process.env.GHL_WEBHOOK_FORWARD_URL;
    }
  });

  await run("webhook: response never leaks any GHL_* env value", async () => {
    process.env.GHL_CLIENT_SECRET = "super-secret";
    process.env.GHL_TOKEN_STORAGE_URL = "https://sink.example.com/ghl/tokens";
    const req = ed25519SignedReq(
      { type: "ContactCreate", webhookId: "wh_leak" },
      { id: "wh_leak" }
    );
    const res = makeRes();
    await webhookHandler(req, res);
    assert(!res.body.includes("super-secret"), "no client_secret leak");
    assert(!res.body.includes("sink.example.com"), "no storage URL leak");
  });

  // Sanity: confirm the production module still exposes both schemes
  // via readinessSummary (independent of test patches).
  await run("module: exports advertise both signature schemes", async () => {
    const fresh = ghlLib.readinessSummary();
    assert(
      Array.isArray(fresh.webhook.signatureSchemes) &&
        fresh.webhook.signatureSchemes.length === 2,
      "two schemes advertised"
    );
    assert(
      typeof ghlLib.GHL_ED25519_PUBLIC_KEY === "string" &&
        ghlLib.GHL_ED25519_PUBLIC_KEY.includes("BEGIN PUBLIC KEY"),
      "Ed25519 public key constant present"
    );
    assert(
      typeof ghlLib.GHL_RSA_PUBLIC_KEY === "string" &&
        ghlLib.GHL_RSA_PUBLIC_KEY.includes("BEGIN PUBLIC KEY"),
      "RSA public key constant present"
    );
  });

  console.log(`\n${failed === 0 ? "ALL SMOKE TESTS PASSED" : `FAILED: ${failed}`}`);
  process.exit(failed === 0 ? 0 : 1);
})();
