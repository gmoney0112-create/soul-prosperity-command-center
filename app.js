const state = {
  theme: "dark",
};

const formatCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

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
