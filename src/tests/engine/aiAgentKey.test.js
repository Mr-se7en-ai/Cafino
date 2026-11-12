// کلید API ایجنت هوش مصنوعی: دسکتاپ → ذخیرهٔ امن سیستم‌عامل؛ وب → همان localStorage
import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fresh } from "./helpers.js";

let E, vault, fetched;
const nativeBridge = (available = true) => ({
  capabilities: async () => ({ secureStore: available }),
  secrets: { set: async (n, v) => { vault[n] = v; return true; }, get: async (n) => vault[n] || "", delete: async (n) => { delete vault[n]; return true; } },
  fetch: async (url, opts) => { fetched.push({ url, opts }); return { ok: true, status: 200, text: JSON.stringify({ choices: [{ message: { content: "سلام" } }] }) }; },
});
beforeEach(() => { E = fresh(); vault = {}; fetched = []; });
afterEach(() => { delete globalThis.window.cafenetNative; });

test("مهاجرت: کلید قدیمی از localStorage به ذخیرهٔ امن می‌رود و در localStorage پاک می‌شود", async () => {
  globalThis.window.cafenetNative = nativeBridge();
  E.lsWrite("cafenet_ai_agent", { type: "openai", url: "https://api.openai.com/v1", model: "m", key: "sk-SECRET", mode: "agent" });
  assert.equal(await E.migrateAgentKey(), true);
  assert.equal(vault.ai_agent_key, "sk-SECRET");
  const raw = globalThis.localStorage.getItem("cafenet_ai_agent");
  assert.ok(!raw.includes("sk-SECRET"), "کلید دیگر در localStorage نیست"); assert.equal(E.getAgentCfg().keyInSecure, true);
});
test("درخواست ایجنت: کلید از ذخیرهٔ امن خوانده و در هدر می‌رود", async () => {
  globalThis.window.cafenetNative = nativeBridge();
  vault.ai_agent_key = "sk-FROM-VAULT";
  const cfg = { type: "openai", url: "https://api.openai.com/v1", model: "m", key: "", keyInSecure: true, shareStats: false, mode: "agent", extra: "" };
  assert.equal(await E.agentAsk(cfg, [], "سلام؟"), "سلام");
  assert.equal(fetched[0].opts.headers.Authorization, "Bearer sk-FROM-VAULT");
});
test("بدون ذخیرهٔ امن (وب یا لینوکس بدون libsecret): کلید دست‌نخورده می‌ماند و مهاجرت انجام نمی‌شود", async () => {
  E.lsWrite("cafenet_ai_agent", { type: "openai", url: "https://x/v1", model: "m", key: "sk-LOCAL" });
  assert.equal(await E.migrateAgentKey(), false);          // بدون پل
  globalThis.window.cafenetNative = nativeBridge(false);
  assert.equal(await E.secureKeyAvailable(), false); assert.equal(await E.migrateAgentKey(), false);
  assert.equal(E.getAgentCfg().key, "sk-LOCAL"); assert.deepEqual(vault, {});
});
