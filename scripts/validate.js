#!/usr/bin/env node
// Lightweight static validation for the Soul Prosperity Command Center.
// - Verifies referenced local asset files exist (from index.html href/src)
// - Verifies forbidden browser storage APIs are not used in client JS

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const indexPath = path.join(repoRoot, "index.html");

const errors = [];

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function checkReferencedAssets() {
  if (!fs.existsSync(indexPath)) {
    errors.push("index.html not found at repo root");
    return;
  }
  const html = read(indexPath);
  const attrRegex = /(?:href|src)\s*=\s*"([^"]+)"/g;
  const seen = new Set();
  let match;
  while ((match = attrRegex.exec(html)) !== null) {
    const ref = match[1];
    if (!ref) continue;
    if (seen.has(ref)) continue;
    seen.add(ref);

    // Only validate local relative references. Skip URLs, anchors, data URIs.
    if (
      ref.startsWith("http://") ||
      ref.startsWith("https://") ||
      ref.startsWith("//") ||
      ref.startsWith("data:") ||
      ref.startsWith("mailto:") ||
      ref.startsWith("#")
    ) {
      continue;
    }

    const cleaned = ref.split("#")[0].split("?")[0];
    if (!cleaned) continue;
    const resolved = path.resolve(repoRoot, cleaned);
    if (!fs.existsSync(resolved)) {
      errors.push(`Missing local asset referenced in index.html: ${ref}`);
    }
  }
}

function checkForbiddenBrowserApis() {
  const jsFiles = ["app.js", "config.js"];
  const forbidden = ["localStorage", "sessionStorage", "indexedDB", "document.cookie"];
  for (const rel of jsFiles) {
    const full = path.join(repoRoot, rel);
    if (!fs.existsSync(full)) continue;
    const src = read(full);
    for (const token of forbidden) {
      if (src.includes(token)) {
        errors.push(`Forbidden browser storage API '${token}' found in ${rel}`);
      }
    }
  }
}

function checkRequiredFiles() {
  const required = ["index.html", "styles.css", "app.js", "config.js"];
  for (const rel of required) {
    if (!fs.existsSync(path.join(repoRoot, rel))) {
      errors.push(`Required file missing: ${rel}`);
    }
  }
}

checkRequiredFiles();
checkReferencedAssets();
checkForbiddenBrowserApis();

if (errors.length > 0) {
  console.error("Validation failed:");
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}

console.log("Validation passed: required files present, local assets resolved, no forbidden browser storage APIs.");
