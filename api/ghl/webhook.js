// POST /api/ghl/webhook
//
// Receives HighLevel webhook deliveries. Behavior:
//
//   1. Read the raw body (signature verification needs exact bytes).
//   2. Verify HighLevel's webhook signature against the documented
//      public keys built into this repo:
//        - Current scheme: Ed25519 over `X-GHL-Signature` (base64).
//        - Legacy scheme:  RSA-SHA256 over `X-WH-Signature` (base64).
//      No env-var secret is required — the public keys are published
//      by HighLevel and embedded in api/_lib/ghl.js. Reject 401 on
//      signature mismatch or missing header.
//   3. Best-effort de-dup by webhook id (in-memory; serverless may
//      reset between invocations — production must back this with KV).
//   4. Validate event type against GHL_ALLOWED_WEBHOOK_EVENTS.
//   5. Forward sanitized payload to GHL_WEBHOOK_FORWARD_URL if set,
//      else log sanitized metadata. Never block the 2xx ack on
//      forwarding outcome — HighLevel's 10s timeout demands a fast
//      ack and async work.

"use strict";

const {
  jsonResponse,
  methodNotAllowed,
  readRawBody,
  safeJsonParse,
  verifyWebhookSignature,
  recordWebhookId,
  getWebhookConfig,
  forwardJson,
  logSafe,
  isPlaceholder,
  sanitizeForLog,
} = require("../_lib/ghl");

function getHeader(req, name) {
  if (!req.headers) return "";
  const lower = name.toLowerCase();
  const v = req.headers[lower];
  if (Array.isArray(v)) return v[0] || "";
  return v ? String(v) : "";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  let raw;
  try {
    raw = await readRawBody(req);
  } catch (err) {
    if (err && err.message === "payload_too_large") {
      return jsonResponse(res, 413, { ok: false, error: "payload_too_large" });
    }
    return jsonResponse(res, 400, { ok: false, error: "body_read_failed" });
  }

  const cfg = getWebhookConfig();
  const verification = verifyWebhookSignature(raw, req.headers || {});
  if (!verification.verified) {
    logSafe("ghl.webhook.signature_invalid", {
      reason: verification.reason,
      body_bytes: raw.length,
      has_x_ghl: !!getHeader(req, "x-ghl-signature"),
      has_x_wh: !!getHeader(req, "x-wh-signature"),
    });
    return jsonResponse(res, 401, {
      ok: false,
      error: "invalid_signature",
      reason: verification.reason,
    });
  }

  const payload = safeJsonParse(raw);
  if (!payload || typeof payload !== "object") {
    return jsonResponse(res, 400, { ok: false, error: "invalid_json" });
  }

  const webhookId =
    getHeader(req, "x-wh-id") ||
    getHeader(req, "x-ghl-webhook-id") ||
    payload.webhookId ||
    payload.webhook_id ||
    null;
  const eventType = payload.type || payload.event || null;

  if (!eventType) {
    return jsonResponse(res, 400, {
      ok: false,
      error: "missing_event_type",
    });
  }

  if (cfg.allowedEvents.length > 0 && !cfg.allowedEvents.includes(eventType)) {
    logSafe("ghl.webhook.event_rejected", {
      type: eventType,
      webhook_id: webhookId,
    });
    // 200 so HighLevel doesn't retry an event we deliberately ignore.
    return jsonResponse(res, 200, {
      ok: true,
      ignored: true,
      reason: "event_not_in_allowlist",
      type: eventType,
    });
  }

  const fresh = recordWebhookId(webhookId);
  if (!fresh) {
    logSafe("ghl.webhook.duplicate", {
      type: eventType,
      webhook_id: webhookId,
    });
    return jsonResponse(res, 200, {
      ok: true,
      duplicate: true,
      webhook_id: webhookId,
    });
  }

  // Ack first, forward second — but in serverless we can't truly
  // background the forward without orchestration. Run it inline with a
  // short timeout and never let its outcome change our 2xx ack.
  let forwardResult = { configured: false };
  if (!isPlaceholder(cfg.forwardUrl)) {
    const fwd = await forwardJson(cfg.forwardUrl, {
      kind: "ghl.webhook",
      received_at: new Date().toISOString(),
      type: eventType,
      webhook_id: webhookId,
      signature_scheme: verification.scheme,
      payload,
    });
    forwardResult = {
      configured: true,
      delivered: !!fwd.ok,
      status: fwd.status || null,
    };
    if (!fwd.ok) {
      logSafe("ghl.webhook.forward_failed", {
        type: eventType,
        webhook_id: webhookId,
        status: fwd.status || null,
        error: fwd.error || null,
      });
    }
  } else {
    logSafe("ghl.webhook.received", {
      type: eventType,
      webhook_id: webhookId,
      signature_scheme: verification.scheme,
      payload: sanitizeForLog(payload),
    });
  }

  return jsonResponse(res, 200, {
    ok: true,
    accepted: true,
    type: eventType,
    webhook_id: webhookId,
    signature_scheme: verification.scheme,
    forwarded: forwardResult,
  });
};
