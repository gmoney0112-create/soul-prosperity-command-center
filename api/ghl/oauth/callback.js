// GET /api/ghl/oauth/callback?code=...
//
// HighLevel Marketplace redirects an installing operator here after
// they pick a sub-account. We exchange the short-lived `code` for an
// access + refresh token at services.leadconnectorhq.com/oauth/token.
//
// Secret boundary:
//   - GHL_CLIENT_SECRET stays on the server. NEVER sent to the browser,
//     NEVER reflected in any response body, NEVER logged.
//   - Exchanged tokens are NEVER returned in the HTTP response to the
//     browser. They are stored server-side (see storage precedence below).
//   - If no storage is configured the response tells the operator and
//     the install is flagged incomplete. We do NOT silently drop tokens.
//
// Token storage precedence:
//   1. Vercel KV (KV_REST_API_URL + KV_REST_API_TOKEN) -- preferred.
//      Tokens stored under ghl:oauth:<locationId|companyId|default>
//      with a 30-day TTL via the Upstash REST pipeline API.
//   2. GHL_TOKEN_STORAGE_URL -- operator HTTP sink (fallback).
//      If present and KV is not, tokens are POSTed to this URL.
//   If both are set, KV takes precedence; URL is not forwarded to
//   (configure GHL_WEBHOOK_FORWARD_URL if you need fan-out).

"use strict";

const {
  TOKEN_URL,
  jsonResponse,
  methodNotAllowed,
  getOAuthConfig,
  isPlaceholder,
  isKvConfigured,
  storeTokenInKv,
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
  // Full token bundle for server-side storage. Never returned to browser.
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

  // Deterministic KV key: ghl:oauth:<locationId|companyId|default>
  const storageKey =
    "ghl:oauth:" + (tokens.locationId || tokens.companyId || "default");

  let persistence = { configured: false };

  if (isKvConfigured()) {
    // Preferred path: Vercel KV (Upstash REST). Tokens stored server-side
    // with a 30-day TTL; overwritten on each fresh install.
    const kv = await storeTokenInKv(storageKey, persistencePayload);
    persistence = {
      configured: true,
      backend: "vercel-kv",
      delivered: !!kv.ok,
      status: kv.status || null,
    };
    if (!kv.ok) {
      logSafe("ghl.oauth.token_persist_kv_failed", {
        status: kv.status || null,
        error: kv.error || null,
      });
    }
  } else if (!isPlaceholder(oauth.tokenStorageUrl)) {
    // Fallback path: operator-supplied HTTP sink.
    const fwd = await forwardJson(oauth.tokenStorageUrl, persistencePayload);
    persistence = {
      configured: true,
      backend: "url",
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

  // Browser response: confirm install + persistence state. Tokens are
  // never returned here; operator verifies via their storage sink.
  if (!persistence.configured) {
    return jsonResponse(res, 200, {
      ok: true,
      installed: true,
      persisted: false,
      warning:
        "Token exchange succeeded but no token storage is configured. " +
        "Tokens were NOT persisted. Connect a Vercel KV store to this project " +
        "(Project -> Storage -> Connect KV Store) or set GHL_TOKEN_STORAGE_URL, " +
        "then re-run the install from the Marketplace install URL.",
      location_id: tokens.locationId || null,
      scope: tokens.scope || null,
      expires_in: tokens.expires_in || null,
      next_steps: [
        "Option A (preferred): Connect a KV store in the Vercel dashboard — KV_REST_API_URL and KV_REST_API_TOKEN are injected automatically.",
        "Option B: Set GHL_TOKEN_STORAGE_URL to a server-side HTTPS sink you own.",
        "After adding storage, verify /api/ghl/health shows ready.oauth=true, then trigger a fresh install.",
      ],
    });
  }

  if (!persistence.delivered) {
    return jsonResponse(res, 502, {
      ok: false,
      installed: true,
      persisted: false,
      error: "token_persistence_failed",
      backend: persistence.backend,
      message:
        "Token exchange succeeded but the configured storage did not accept the tokens. Check the sink and re-run the install.",
      provider_status: persistence.status,
    });
  }

  return jsonResponse(res, 200, {
    ok: true,
    installed: true,
    persisted: true,
    backend: persistence.backend,
    location_id: tokens.locationId || null,
    scope: tokens.scope || null,
    expires_in: tokens.expires_in || null,
  });
};
