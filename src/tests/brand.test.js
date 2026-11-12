import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { APP_BRAND, APP_NAME, APP_VERSION, APP_CHANGELOG } from "../app/core/version.js";

test("brand constants", () => {
  assert.equal(APP_BRAND.fa, "کافینو");
  assert.equal(APP_BRAND.en, "CAFINO");
  assert.equal(APP_NAME, "کافینو | CAFINO");
  assert.equal(APP_BRAND.tagline, "سامانه مدیریت هوشمند کافی‌نت");
  assert.equal(APP_BRAND.meaning, "CAFE + FINANCE + INFO");
});

test("changelog newest entry matches APP_VERSION", () => {
  assert.equal(APP_CHANGELOG[0].v, APP_VERSION);
});

test("packaging files carry the new name and version", () => {
  const root = new URL("../../", import.meta.url);
  const rd = (p) => fs.readFileSync(new URL(p, root), "utf8");
  for (const p of ["index.html", "pwa/index.html", "el/electron-app/app/index.html"]) assert.match(rd(p), /<title>کافینو \| CAFINO/);
  const man = JSON.parse(rd("pwa/manifest.webmanifest"));
  assert.match(man.name, /^کافینو \| CAFINO/);
  assert.equal(man.short_name, "کافینو");
  const pkg = JSON.parse(rd("el/electron-app/package.json"));
  assert.equal(pkg.version, APP_VERSION);
  assert.match(rd("pwa/sw.js"), new RegExp(`VERSION = "${APP_VERSION.replace(/\./g, "\\.")}"`));
});

test("UI wiring: dashboard banner, login brand and About tab exist", () => {
  const root = new URL("../", import.meta.url);
  const rd = (p) => fs.readFileSync(new URL(p, root), "utf8");
  assert.match(rd("app/pages/dashboard.jsx"), /data-testid="brand-banner"/);
  assert.match(rd("app/app/AuthScreen.jsx"), /data-testid="auth-brand"/);
  assert.match(rd("app/core/constants.js"), /key:"about".*label:"درباره من"/);
  assert.match(rd("app/app/MainApp.jsx"), /activeTab==="about"/);
});
