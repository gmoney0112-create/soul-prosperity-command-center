#!/usr/bin/env node
// Lightweight smoke tests for the GHL serverless handlers. Runs each
// handler in-process against a mocked req/res so we don't need to
// boot Vercel locally. Exits 0 on success, 1 on any failed assertion.

"use strict";

const crypto = require("crypto");
const path = require("path");
const { Readable } = require("stream");

const repoRoot = path.resolve(__dirname, "..");
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
    assert(
      Array.isArray(json.config.webhook.allowedEvents),
      "allowedEvents is an array"
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
    // Stub global fetch to return a 401 from HighLevel.
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
      // Critical: token must NOT appear in browser response.
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
      assert(seen.length === 1, "sink received exactly one POST");
      assert(seen[0].access_token === "at_xyz", "sink got access_token");
      assert(seen[0].refresh_token === "rt_xyz", "sink got refresh_token");
      assert(!res.body.includes("at_xyz"), "browser response still has no token");
    } finally {
      global.fetch = originalFetch;
    }
  });

  // ── /api/ghl/webhook ──────────────────────────────────────────
  function signedReq(secret, payloadObj, opts) {
    const o = opts || {};
    const raw = Buffer.from(JSON.stringify(payloadObj));
    const sig = crypto.createHmac("sha256", secret).update(raw).digest("hex");
    return makeReq({
      method: "POST",
      url: "/api/ghl/webhook",
      headers: {
        "content-type": "application/json",
        "x-wh-signature": o.badSig ? sig + "00" : sig,
        "x-wh-id": o.id || "wh_" + crypto.randomBytes(6).toString("hex"),
      },
      body: raw,
    });
  }

  await run("webhook: GET returns 405", async () => {
    const req = makeReq({ method: "GET", url: "/api/ghl/webhook" });
    const res = makeRes();
    await webhookHandler(req, res);
    assert(res.status === 405, "status 405");
  });

  await run("webhook: invalid signature rejected with 401", async () => {
    process.env.GHL_WEBHOOK_SIGNING_SECRET = "wh-secret";
    const req = signedReq("wh-secret", { type: "ContactCreate" }, { badSig: true });
    const res = makeRes();
    await webhookHandler(req, res);
    assert(res.status === 401, "status 401");
    const json = JSON.parse(res.body);
    assert(json.error === "invalid_signature", "error code");
  });

  await run("webhook: valid signature + allowed event accepted", async () => {
    process.env.GHL_WEBHOOK_SIGNING_SECRET = "wh-secret";
    delete process.env.GHL_WEBHOOK_FORWARD_URL;
    const req = signedReq(
      "wh-secret",
      { type: "ContactCreate", webhookId: "wh_one", contact: { email: "x@y.z" } },
      { id: "wh_one" }
    );
    const res = makeRes();
    await webhookHandler(req, res);
    assert(res.status === 200, "status 200");
    const json = JSON.parse(res.body);
    assert(json.accepted === true, "accepted=true");
    assert(json.type === "ContactCreate", "event type echoed");
    assert(json.forwarded.configured === false, "forwarded.configured=false");
  });

  await run("webhook: duplicate id de-duplicated", async () => {
    process.env.GHL_WEBHOOK_SIGNING_SECRET = "wh-secret";
    const dupReq = signedReq(
      "wh-secret",
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
    process.env.GHL_WEBHOOK_SIGNING_SECRET = "wh-secret";
    process.env.GHL_ALLOWED_WEBHOOK_EVENTS = "ContactCreate";
    const req = signedReq(
      "wh-secret",
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
    process.env.GHL_WEBHOOK_SIGNING_SECRET = "wh-secret";
    process.env.GHL_WEBHOOK_FORWARD_URL = "https://sink.example.com/ghl/webhook";
    const seen = [];
    const originalFetch = global.fetch;
    global.fetch = async (url, init) => {
      seen.push({ url, body: JSON.parse(init.body) });
      return { ok: true, status: 202, text: async () => "" };
    };
    try {
      const req = signedReq(
        "wh-secret",
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
    } finally {
      global.fetch = originalFetch;
      delete process.env.GHL_WEBHOOK_FORWARD_URL;
    }
  });

  console.log(`\n${failed === 0 ? "ALL SMOKE TESTS PASSED" : `FAILED: ${failed}`}`);
  process.exit(failed === 0 ? 0 : 1);
})();
