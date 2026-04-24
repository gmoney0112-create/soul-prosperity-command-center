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

function getConfig() {
  return (typeof window !== "undefined" && window.SP_CONFIG) || {};
}

function isPlaceholder(value) {
  if (!value) return true;
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
    const value = config[key];
    const pending = isPlaceholder(value);
    const hideWhenPending = el.hasAttribute("data-config-fallback-hide");

    if (pending) {
      el.setAttribute("href", "#wiring");
      el.setAttribute("data-pending", "true");
      if (hideWhenPending) {
        el.setAttribute("hidden", "");
      }
    } else {
      el.setAttribute("href", value);
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
      el.removeAttribute("data-pending");
      el.removeAttribute("hidden");
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

setTheme(state.theme);
bindEvents();
updateReadiness();
updateCalculator();
applyConfigLinks();
renderWiringStatus();
