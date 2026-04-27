// GET /api/ghl/oauth/callback?code=...
//
// HighLevel Marketplace redirects an installing operator here after
// they pick a sub-account. We exchange the short-lived `code` for an
// access + refresh token at services.leadconnectorhq.com/oauth/token.
//
// Secret boundary:
//   - GHL_CLIENT_SECRET stays on the server. It is NEVER sent to the
//     browser, NEVER reflected in any response body, and NEVER logged.
//   - The exchanged tokens are NEVER returned in the HTTP response to
//     the browser. They are forwarded to GHL_TOKEN_STORAGE_URL (an
//     operator-controlled, server-side webhook / KV ingest endpoint).
//   - If GHL_TOKEN_STORAGE_URL is not configured, the response tells
//     the operator persistence is unconfigured and the install is
//     incomplete. We do NOT pretend the tokens were stored.

"use strict";

const {
  TOKEN_URL,
  jsonResponse,
  methodNotAllowed,
  getOAuthConfig,
  isPlaceholder,
  postForm,
  forwardJson,
  logSafe,
} = require("../../_lib/ghl");

function parseQuery(req) {
  try {
    // req.url is path+query; build against a dummy origin so URL parses.
    const u = new URL(req.url, "http://localhost");
    const out = {};
    for (const [k, v] of u.searchParams.entries()) out[k] = v;
    return out;
  } catch (_err) {
    return {};
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  const oauth = getOAuthConfig();
  const missing = [];
  if (isPlaceholder(oauth.clientId)) missing.push("GHL_CLIENT_ID");
  if (isPlaceholder(oauth.clientSecret)) missing.push("GHL_CLIENT_SECRET");
  if (isPlaceholder(oauth.redirectUri)) missing.push("GHL_OAUTH_REDIRECT_URI");
  if (missing.length > 0) {
    return jsonResponse(res, 500, {
      ok: false,
      error: "server_not_configured",
      message:
        "OAuth env vars missing on the server. Configure these in the Vercel project before clicking Install in the Marketplace.",
      missing,
    });
  }

  const q = parseQuery(req);

  if (q.error) {
    // HighLevel surfaces install-cancellation / scope-rejection here.
    return jsonResponse(res, 400, {
      ok: false,
      error: "marketplace_error",
      provider_error: String(q.error),
      provider_error_description: q.error_description
        ? String(q.error_description)
        : undefined,
    });
  }

  const code = q.code ? String(q.code).trim() : "";
  if (!code) {
    return jsonResponse(res, 400, {
      ok: false,
      error: "missing_code",
      message:
        "OAuth callback was hit without a ?code= parameter. Re-start the install from the Marketplace install URL.",
    });
  }

  let exchange;
  try {
    exchange = await postForm(TOKEN_URL, {
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      grant_type: "authorization_code",
      code,
      user_type: oauth.userType,
      redirect_uri: oauth.redirectUri,
    });
  } catch (err) {
    logSafe("ghl.oauth.exchange_failed", {
      message: err && err.message ? err.message : "unknown",
    });
    return jsonResponse(res, 502, {
      ok: false,
      error: "token_exchange_failed",
      message: "Network error contacting HighLevel token endpoint.",
    });
  }

  if (!exchange.ok || !exchange.json || !exchange.json.access_token) {
    logSafe("ghl.oauth.exchange_rejected", {
      status: exchange.status,
      // Redact the body — it may echo the code or other sensitive bits.
      hasJson: !!exchange.json,
    });
    return jsonResponse(res, 502, {
      ok: false,
      error: "token_exchange_rejected",
      provider_status: exchange.status,
      message:
        "HighLevel rejected the token exchange. Verify GHL_CLIENT_ID, GHL_CLIENT_SECRET, and GHL_OAUTH_REDIRECT_URI exactly match the Marketplace app settings.",
    });
  }

  const tokens = exchange.json;
  // Strip nothing — forward the full bundle to the operator's storage
  // sink. The sink endpoint is server-to-server and operator-owned.
  const persistencePayload = {
    kind: "ghl.oauth.tokens",
    received_at: new Date().toISOString(),
    location_id: tokens.locationId || null,
    company_id: tokens.companyId || null,
    user_id: tokens.userId || null,
    user_type: oauth.userType,
    scope: tokens.scope || null,
    expires_in: tokens.expires_in || null,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || null,
  };

  let persistence = { configured: false };
  if (!isPlaceholder(oauth.tokenStorageUrl)) {
    const fwd = await forwardJson(oauth.tokenStorageUrl, persistencePayload);
    persistence = {
      configured: true,
      delivered: !!fwd.ok,
      status: fwd.status || null,
    };
    if (!fwd.ok) {
      logSafe("ghl.oauth.token_persist_failed", {
        status: fwd.status || null,
        error: fwd.error || null,
      });
    }
  }

  // Browser response: confirm install + persistence state, but never
  // reveal the tokens. Operator can verify by checking their sink.
  if (!persistence.configured) {
    return jsonResponse(res, 200, {
      ok: true,
      installed: true,
      persisted: false,
      warning:
        "Token exchange succeeded but GHL_TOKEN_STORAGE_URL is not configured. Tokens were NOT persisted. Configure a server-side sink (Vercel KV ingest endpoint, your own /tokens/store route, or Upstash) and re-run the install before any API calls are attempted.",
      location_id: tokens.locationId || null,
      scope: tokens.scope || null,
      expires_in: tokens.expires_in || null,
      next_step:
        "Set GHL_TOKEN_STORAGE_URL in Vercel project env vars and trigger a fresh install from the Marketplace install URL.",
    });
  }

  if (!persistence.delivered) {
    return jsonResponse(res, 502, {
      ok: false,
      installed: true,
      persisted: false,
      error: "token_persistence_failed",
      message:
        "Token exchange succeeded but the configured GHL_TOKEN_STORAGE_URL did not accept the tokens. Check the sink and re-run the install.",
      provider_status: persistence.status,
    });
  }

  return jsonResponse(res, 200, {
    ok: true,
    installed: true,
    persisted: true,
    location_id: tokens.locationId || null,
    scope: tokens.scope || null,
    expires_in: tokens.expires_in || null,
  });
};
