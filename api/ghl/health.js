// GET /api/ghl/health
//
// Operator-facing readiness probe for the GHL serverless layer.
// Returns ONLY booleans about which env vars are configured — never
// the values themselves. Safe to expose publicly; do not gate.

"use strict";

const {
  jsonResponse,
  methodNotAllowed,
  readinessSummary,
} = require("../_lib/ghl");

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return methodNotAllowed(res, ["GET", "HEAD"]);
  }
  const summary = readinessSummary();
  // Token storage (Vercel KV or GHL_TOKEN_STORAGE_URL) is required for
  // oauth=true so operators know tokens will actually be persisted after
  // the install redirect. Without storage the OAuth round-trip succeeds
  // but tokens go nowhere, making the install incomplete.
  const oauthReady =
    summary.oauth.clientId &&
    summary.oauth.clientSecret &&
    summary.oauth.redirectUri &&
    summary.oauth.tokenStorageConfigured;
  // Webhook signature verification uses HighLevel's published public
  // keys baked into the repo — no env secret is required for it.
  const webhookReady = summary.webhook.signatureVerification === true;

  return jsonResponse(res, 200, {
    ok: true,
    service: "soul-prosperity-ghl",
    runtime: "vercel-node",
    time: new Date().toISOString(),
    ready: {
      oauth: oauthReady,
      webhook: webhookReady,
    },
    config: summary,
  });
};
