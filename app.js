const state = {
  theme: "dark",
};

const formatCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const LINK_DEFINITIONS = [
  { key: "freebieOptIn", label: "Freebie opt-in", purpose: "Capture leads with the free gift page or form." },
  { key: "ebook7Checkout", label: "$7 eBook checkout", purpose: "Primary front-end buyer conversion." },
  { key: "audio17Checkout", label: "$17 audiobook checkout", purpose: "Order bump after the $7 buy." },
  { key: "paperback27Checkout", label: "$27 paperback checkout", purpose: "Physical bundle upsell." },
  { key: "course67Checkout", label: "$67 course checkout", purpose: "Implementation course upsell." },
  { key: "skoolTrial", label: "Skool trial", purpose: "7-day community trial landing." },
  { key: "skoolAnnual", label: "Skool annual", purpose: "$247/yr community commitment path." },
  { key: "lifetimeAccess", label: "Lifetime access", purpose: "$497 premium close." },
  { key: "ghlDashboard", label: "GHL dashboard", purpose: "Operator shortcut to the GHL main dashboard." },
  { key: "ghlWorkflows", label: "GHL workflows", purpose: "Operator shortcut to the GHL automation builder." },
  { key: "analytics", label: "Analytics", purpose: "Revenue and traffic dashboard." },
  { key: "socialBioLink", label: "Social bio link", purpose: "Single link used across every social profile bio." },
];

const CONFIG_KEY_ORDER = LINK_DEFINITIONS.map((def) => def.key);

// GHL production wiring — nested under window.SP_CONFIG.ghl.*
// These are surfaced in the dedicated "GHL Wiring" panel and do NOT
// participate in the Config Builder (they include IDs and OAuth
// metadata, not just URLs). Operators edit config.js directly for
// these values; the panel reports placeholder vs. ready.
const GHL_WIRING_DEFINITIONS = [
  {
    path: "ghl.locationId",
    label: "Location ID",
    purpose: "HighLevel sub-account ID this dashboard targets.",
    kind: "id",
    required: true,
  },
  {
    path: "ghl.dashboardUrl",
    label: "GHL dashboard URL",
    purpose: "Operator entry to the sub-account home.",
    kind: "url",
    required: false,
  },
  {
    path: "ghl.workflowsUrl",
    label: "Workflows URL",
    purpose: "Direct link to Automation → Workflows.",
    kind: "url",
    required: false,
  },
  {
    path: "ghl.campaignsUrl",
    label: "Campaigns URL",
    purpose: "Direct link to Marketing → Campaigns.",
    kind: "url",
    required: false,
  },
  {
    path: "ghl.contactsUrl",
    label: "Contacts URL",
    purpose: "Direct link to Contacts → Smart List.",
    kind: "url",
    required: false,
  },
  {
    path: "ghl.opportunitiesUrl",
    label: "Opportunities URL",
    purpose: "Pipeline board for the Soul Prosperity Ladder.",
    kind: "url",
    required: false,
  },
  {
    path: "ghl.conversationsUrl",
    label: "Conversations URL",
    purpose: "Inbox for inbound email/SMS replies.",
    kind: "url",
    required: false,
  },
  {
    path: "ghl.analyticsUrl",
    label: "Analytics URL",
    purpose: "Reporting → Dashboard for revenue + attribution.",
    kind: "url",
    required: false,
  },
  {
    path: "ghl.calendarBookingUrl",
    label: "Calendar booking URL",
    purpose: "Public booking page used in nurture and bio.",
    kind: "url",
    required: false,
  },
  {
    path: "ghl.oauth.clientId",
    label: "OAuth client_id",
    purpose: "Public Marketplace client_id (safe to expose).",
    kind: "id",
    required: true,
  },
  {
    path: "ghl.oauth.installUrl",
    label: "OAuth install URL",
    purpose: "Marketplace chooselocation install link operators paste.",
    kind: "url",
    required: true,
  },
  {
    path: "ghl.oauth.redirectUri",
    label: "OAuth redirect URI",
    purpose: "Where HighLevel redirects with ?code=... after install.",
    kind: "url",
    required: true,
  },
  {
    path: "ghl.webhook.targetUrl",
    label: "Webhook target URL",
    purpose: "Public HTTPS endpoint that receives HighLevel webhooks.",
    kind: "url",
    required: true,
  },
];

function getConfig() {
  return (typeof window !== "undefined" && window.SP_CONFIG) || {};
}

function getConfigPath(path) {
  const config = getConfig();
  if (!path) return undefined;
  const parts = String(path).split(".");
  let cur = config;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}

function isPlaceholder(value) {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === "#") return true;
  if (trimmed.toUpperCase().startsWith("REPLACE_")) return true;
  return false;
}

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute("data-theme", theme);
}

function scrollToSection(targetId) {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateReadiness() {
  const boxes = [...document.querySelectorAll('[data-checklist] input[type="checkbox"]')];
  const checked = boxes.filter((box) => box.checked).length;
  const score = boxes.length ? Math.round((checked / boxes.length) * 100) : 0;
  const fill = document.querySelector("[data-meter-fill]");
  const label = document.querySelector("[data-readiness-score]");

  if (fill) fill.style.width = `${score}%`;
  if (label) label.textContent = String(score);
}

function numberValue(name) {
  const input = document.querySelector(`[data-calc="${name}"]`);
  return Number(input?.value || 0);
}

function setResult(name, value) {
  const result = document.querySelector(`[data-result="${name}"]`);
  if (result) result.textContent = value;
}

function updateCalculator() {
  const leads = numberValue("leads");
  const ebookRate = numberValue("ebookRate") / 100;
  const bundleRate = numberValue("bundleRate") / 100;
  const courseRate = numberValue("courseRate") / 100;
  const skoolRate = numberValue("skoolRate") / 100;

  const buyers = Math.round(leads * ebookRate);
  const bundleBuyers = Math.round(buyers * bundleRate);
  const courseBuyers = Math.round(buyers * courseRate);
  const skoolStarts = Math.round(buyers * skoolRate);
  const revenue = buyers * 7 + bundleBuyers * 17 + bundleBuyers * 27 + courseBuyers * 67;

  setResult("buyers", String(buyers));
  setResult("bundleBuyers", String(bundleBuyers));
  setResult("courseBuyers", String(courseBuyers));
  setResult("skoolStarts", String(skoolStarts));
  setResult("revenue", formatCurrency.format(revenue));
}

function applyConfigLinks() {
  const config = getConfig();
  document.querySelectorAll("[data-config-link]").forEach((el) => {
    const key = el.dataset.configLink;
    const value = key && key.includes(".") ? getConfigPath(key) : config[key];
    const pending = isPlaceholder(value);
    const hideWhenPending = el.hasAttribute("data-config-fallback-hide");

    if (pending) {
      const fallbackTarget = key && key.startsWith("ghl.") ? "#ghl-wiring" : "#wiring";
      el.setAttribute("href", fallbackTarget);
      el.setAttribute("data-pending", "true");
      el.setAttribute("title", "Pending — click to see exact next setup step.");
      if (hideWhenPending) {
        el.setAttribute("hidden", "");
      }
    } else {
      el.setAttribute("href", value);
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
      el.removeAttribute("data-pending");
      el.removeAttribute("hidden");
      el.removeAttribute("title");
    }
  });
}

function renderWiringStatus() {
  const list = document.querySelector("[data-wiring-list]");
  if (!list) return;
  const config = getConfig();

  let ready = 0;
  const fragment = document.createDocumentFragment();

  LINK_DEFINITIONS.forEach((def) => {
    const value = config[def.key];
    const pending = isPlaceholder(value);
    if (!pending) ready += 1;

    const item = document.createElement("li");
    item.className = "wiring-item";
    item.dataset.status = pending ? "pending" : "ready";

    const head = document.createElement("div");
    head.className = "wiring-head";

    const title = document.createElement("strong");
    title.textContent = def.label;

    const badge = document.createElement("span");
    badge.className = "wiring-badge";
    badge.textContent = pending ? "placeholder" : "ready";

    head.appendChild(title);
    head.appendChild(badge);

    const purpose = document.createElement("p");
    purpose.className = "wiring-purpose";
    purpose.textContent = def.purpose;

    const meta = document.createElement("p");
    meta.className = "wiring-meta";
    if (pending) {
      meta.textContent = `config.js → ${def.key} (not set)`;
    } else {
      const link = document.createElement("a");
      link.href = value;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = value;
      meta.appendChild(document.createTextNode(`config.js → ${def.key}: `));
      meta.appendChild(link);
    }

    item.appendChild(head);
    item.appendChild(purpose);
    item.appendChild(meta);
    fragment.appendChild(item);
  });

  list.replaceChildren(fragment);

  const total = LINK_DEFINITIONS.length;
  const pending = total - ready;
  const setText = (selector, value) => {
    const el = document.querySelector(selector);
    if (el) el.textContent = String(value);
  };
  setText("[data-wiring-ready]", ready);
  setText("[data-wiring-pending]", pending);
  setText("[data-wiring-total]", total);
}

function classifyUrl(raw) {
  const value = (raw == null ? "" : String(raw)).trim();
  if (!value || value === "#" || value.toUpperCase().startsWith("REPLACE_")) {
    return { status: "placeholder", message: "Placeholder — replace before launch." };
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { status: "invalid", message: "Must start with http:// or https://." };
    }
    if (!url.hostname) {
      return { status: "invalid", message: "Missing hostname." };
    }
    return { status: "ready", message: "Ready." };
  } catch (_err) {
    return { status: "invalid", message: "Not a valid URL." };
  }
}

function escapeConfigString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildConfigSource(values) {
  const header = [
    "// Central configuration for all external destinations used by the",
    "// Soul Prosperity Funnel Command Center.",
    "//",
    "// Replace every \"#\" placeholder with the real URL as each piece of the",
    "// funnel goes live. The Launch Links panel in the UI reads this file",
    "// and flags which links are still placeholders vs. ready.",
    "//",
    "// A value is considered a placeholder if it is empty, \"#\", or starts",
    "// with \"REPLACE_\". Anything else is treated as ready.",
    "",
    "window.SP_CONFIG = {",
  ];

  const groups = [
    { comment: "// Freebie lead magnet opt-in page / form", keys: ["freebieOptIn"] },
    {
      comment: "// Checkout links for each paid offer",
      keys: ["ebook7Checkout", "audio17Checkout", "paperback27Checkout", "course67Checkout"],
    },
    {
      comment: "// Skool community paths",
      keys: ["skoolTrial", "skoolAnnual", "lifetimeAccess"],
    },
    {
      comment: "// Operations tooling",
      keys: ["ghlDashboard", "ghlWorkflows", "analytics"],
    },
    {
      comment: "// Public bio link used across social profiles",
      keys: ["socialBioLink"],
    },
  ];

  const body = [];
  groups.forEach((group, groupIdx) => {
    if (groupIdx > 0) body.push("");
    body.push(`  ${group.comment}`);
    group.keys.forEach((key) => {
      const raw = values[key];
      const value = raw == null ? "#" : String(raw).trim() || "#";
      body.push(`  ${key}: "${escapeConfigString(value)}",`);
    });
  });

  return [...header, ...body, "};", ""].join("\n");
}

function getBuilderFormValues() {
  const values = {};
  CONFIG_KEY_ORDER.forEach((key) => {
    const input = document.querySelector(`[data-builder-input="${key}"]`);
    values[key] = input ? input.value : "";
  });
  return values;
}

function setBuilderStatus(message, tone) {
  const el = document.querySelector("[data-builder-status]");
  if (!el) return;
  el.textContent = message || "";
  el.dataset.tone = tone || "";
}

function updateBuilder() {
  const values = getBuilderFormValues();
  let ready = 0;
  let placeholder = 0;
  let invalid = 0;

  LINK_DEFINITIONS.forEach((def) => {
    const row = document.querySelector(`[data-builder-row="${def.key}"]`);
    const input = document.querySelector(`[data-builder-input="${def.key}"]`);
    const badge = document.querySelector(`[data-builder-badge="${def.key}"]`);
    const hint = document.querySelector(`[data-builder-hint="${def.key}"]`);
    if (!row || !input || !badge || !hint) return;

    const { status, message } = classifyUrl(values[def.key]);
    row.dataset.status = status;
    badge.textContent = status;
    hint.textContent = message;
    input.setAttribute("aria-invalid", status === "invalid" ? "true" : "false");

    if (status === "ready") ready += 1;
    else if (status === "placeholder") placeholder += 1;
    else invalid += 1;
  });

  const setText = (selector, value) => {
    const el = document.querySelector(selector);
    if (el) el.textContent = String(value);
  };
  setText("[data-builder-ready]", ready);
  setText("[data-builder-placeholder]", placeholder);
  setText("[data-builder-invalid]", invalid);
  setText("[data-builder-total]", LINK_DEFINITIONS.length);

  const output = document.querySelector("[data-builder-output]");
  if (output) output.value = buildConfigSource(values);
}

function renderBuilderForm() {
  const container = document.querySelector("[data-builder-fields]");
  if (!container) return;
  const config = getConfig();

  const fragment = document.createDocumentFragment();
  LINK_DEFINITIONS.forEach((def) => {
    const row = document.createElement("div");
    row.className = "builder-row";
    row.dataset.builderRow = def.key;

    const label = document.createElement("label");
    label.className = "builder-label";
    label.setAttribute("for", `builder-input-${def.key}`);

    const labelTop = document.createElement("div");
    labelTop.className = "builder-label-top";

    const title = document.createElement("strong");
    title.textContent = def.label;

    const badge = document.createElement("span");
    badge.className = "builder-badge";
    badge.dataset.builderBadge = def.key;
    badge.textContent = "placeholder";

    labelTop.appendChild(title);
    labelTop.appendChild(badge);

    const purpose = document.createElement("small");
    purpose.className = "builder-purpose";
    purpose.textContent = `${def.purpose} Key: ${def.key}`;

    const input = document.createElement("input");
    input.type = "url";
    input.id = `builder-input-${def.key}`;
    input.className = "builder-input";
    input.dataset.builderInput = def.key;
    input.placeholder = "https://...";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.inputMode = "url";
    const current = config[def.key];
    input.value = current && current !== "#" ? String(current) : "";

    const hint = document.createElement("small");
    hint.className = "builder-hint";
    hint.dataset.builderHint = def.key;
    hint.textContent = "Placeholder — replace before launch.";

    label.appendChild(labelTop);
    label.appendChild(purpose);
    label.appendChild(input);
    label.appendChild(hint);

    row.appendChild(label);
    fragment.appendChild(row);
  });

  container.replaceChildren(fragment);
}

function fallbackCopy(text) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand && document.execCommand("copy");
    document.body.removeChild(ta);
    return !!ok;
  } catch (_err) {
    return false;
  }
}

async function copyBuilderOutput() {
  const output = document.querySelector("[data-builder-output]");
  if (!output) return;
  const text = output.value;

  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      setBuilderStatus("Copied to clipboard.", "success");
      return;
    } catch (_err) {
      // fall through to legacy path
    }
  }

  if (fallbackCopy(text)) {
    setBuilderStatus("Copied using fallback.", "success");
    return;
  }

  output.focus();
  output.select();
  setBuilderStatus("Copy blocked — press Cmd/Ctrl+C to copy manually.", "warn");
}

function resetBuilder() {
  renderBuilderForm();
  updateBuilder();
  setBuilderStatus("Reset to current config.js values.", "success");
}

function bindBuilderEvents() {
  const form = document.querySelector("[data-builder-form]");
  if (!form) return;
  form.addEventListener("input", (event) => {
    if (event.target && event.target.matches("[data-builder-input]")) {
      updateBuilder();
      setBuilderStatus("", "");
    }
  });
  form.addEventListener("submit", (event) => event.preventDefault());

  document.querySelector("[data-builder-copy]")?.addEventListener("click", copyBuilderOutput);
  document.querySelector("[data-builder-reset]")?.addEventListener("click", resetBuilder);
}

function setCopyStatus(key, message, tone) {
  const el = document.querySelector(`[data-copy-status="${key}"]`);
  if (!el) return;
  el.textContent = message || "";
  el.dataset.tone = tone || "";
}

async function handleCopyClick(event) {
  const button = event.currentTarget;
  const key = button.dataset.copyTarget;
  if (!key) return;
  const source = document.querySelector(`[data-copy-source="${key}"]`);
  if (!source) return;
  const text = source.value;

  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(key, "Copied.", "success");
      return;
    } catch (_err) {
      // fall through
    }
  }

  if (fallbackCopy(text)) {
    setCopyStatus(key, "Copied using fallback.", "success");
    return;
  }

  source.focus();
  source.select();
  setCopyStatus(key, "Copy blocked — press Cmd/Ctrl+C.", "warn");
}

function bindCopyButtons() {
  document.querySelectorAll("[data-copy-target]").forEach((btn) => {
    btn.addEventListener("click", handleCopyClick);
  });
}

function bindEvents() {
  document.querySelectorAll("[data-scroll-target]").forEach((control) => {
    control.addEventListener("click", () => scrollToSection(control.dataset.scrollTarget));
  });

  document.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
    setTheme(state.theme === "dark" ? "light" : "dark");
  });

  document.querySelectorAll('[data-checklist] input[type="checkbox"]').forEach((box) => {
    box.addEventListener("change", updateReadiness);
  });

  document.querySelectorAll("[data-calc]").forEach((input) => {
    input.addEventListener("input", updateCalculator);
  });
}

function renderGhlWiring() {
  const list = document.querySelector("[data-ghl-wiring-list]");
  if (!list) return;

  let ready = 0;
  let pending = 0;
  let requiredPending = 0;
  const fragment = document.createDocumentFragment();

  GHL_WIRING_DEFINITIONS.forEach((def) => {
    const value = getConfigPath(def.path);
    const isPending = isPlaceholder(value);
    if (isPending) {
      pending += 1;
      if (def.required) requiredPending += 1;
    } else {
      ready += 1;
    }

    const item = document.createElement("li");
    item.className = "wiring-item";
    item.dataset.status = isPending ? "pending" : "ready";
    item.dataset.required = def.required ? "true" : "false";

    const head = document.createElement("div");
    head.className = "wiring-head";

    const title = document.createElement("strong");
    title.textContent = def.label;

    const badge = document.createElement("span");
    badge.className = "wiring-badge";
    if (isPending) {
      badge.textContent = def.required ? "placeholder · required" : "placeholder";
    } else {
      badge.textContent = "ready";
    }

    head.appendChild(title);
    head.appendChild(badge);

    const purpose = document.createElement("p");
    purpose.className = "wiring-purpose";
    purpose.textContent = def.purpose;

    const meta = document.createElement("p");
    meta.className = "wiring-meta";
    if (isPending) {
      meta.textContent = `config.js → SP_CONFIG.${def.path} (not set) — see docs/GHL_SETUP.md`;
    } else if (def.kind === "url") {
      const link = document.createElement("a");
      link.href = String(value);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = String(value);
      meta.appendChild(document.createTextNode(`SP_CONFIG.${def.path}: `));
      meta.appendChild(link);
    } else {
      const code = document.createElement("code");
      code.textContent = String(value);
      meta.appendChild(document.createTextNode(`SP_CONFIG.${def.path}: `));
      meta.appendChild(code);
    }

    item.appendChild(head);
    item.appendChild(purpose);
    item.appendChild(meta);
    fragment.appendChild(item);
  });

  list.replaceChildren(fragment);

  const total = GHL_WIRING_DEFINITIONS.length;
  const setText = (selector, value) => {
    const el = document.querySelector(selector);
    if (el) el.textContent = String(value);
  };
  setText("[data-ghl-ready]", ready);
  setText("[data-ghl-pending]", pending);
  setText("[data-ghl-required-pending]", requiredPending);
  setText("[data-ghl-total]", total);

  // Render the static OAuth + API + webhook reference summary so the
  // operator can see the exact endpoints without leaving the page.
  const config = getConfig();
  const ghl = (config && config.ghl) || {};
  const api = ghl.api || {};
  const webhook = ghl.webhook || {};
  const oauth = ghl.oauth || {};

  const setCode = (selector, text) => {
    const el = document.querySelector(selector);
    if (el) el.textContent = text || "—";
  };
  setCode("[data-ghl-api-base]", api.base);
  setCode("[data-ghl-api-version]", api.version);
  setCode("[data-ghl-api-token-url]", api.tokenUrl);
  setCode("[data-ghl-api-auth-base]", api.authBaseUrl);
  setCode("[data-ghl-oauth-scopes]", oauth.scopes);

  const eventsList = document.querySelector("[data-ghl-webhook-events]");
  if (eventsList) {
    eventsList.replaceChildren();
    const events = Array.isArray(webhook.events) ? webhook.events : [];
    if (events.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No events configured.";
      eventsList.appendChild(li);
    } else {
      events.forEach((ev) => {
        const li = document.createElement("li");
        const code = document.createElement("code");
        code.textContent = ev;
        li.appendChild(code);
        eventsList.appendChild(li);
      });
    }
  }
}

setTheme(state.theme);
bindEvents();
bindBuilderEvents();
bindCopyButtons();
updateReadiness();
updateCalculator();
applyConfigLinks();
renderWiringStatus();
renderGhlWiring();
renderBuilderForm();
updateBuilder();
