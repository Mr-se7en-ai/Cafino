// شکست نور لبهٔ شیشه (از Glasswork، MIT) روی چند سطح اصلی: منوی کناری، هدر، نوار پایین موبایل و بزرگ‌ترین کارت‌های صفحه.
// فقط در Chromium (مرورگر کروم/اج، Electron) کشیده می‌شود؛ جای دیگر شیشهٔ CSS بدون شکست نور می‌ماند.
// تعداد سطح‌ها عمداً محدود است (فیلتر SVG برای هر سطح هزینه دارد).
import { liquidGlass, isLensSupported } from "./lens.js";

const CARD = '[style*="var(--bg-card)"]';
const FIXED_TARGETS = ["aside.no-print", ".fl-header", "nav.no-print"];
const MAX_CARDS = 0; // عدسی فقط روی منوی کناری، هدر و نوار پایین؛ روی کارت‌های پهن لکهٔ لبه می‌انداخت
const LENS = { rim: 22, edge: 0.35, power: 2.8, dispersion: 0.06 };

const state = { lenses: new Map(), obs: null, timer: 0, last: 0, enabled: true, running: false };

const visible = (e) => e.isConnected && e.getClientRects().length > 0;
export function pickTargets(root = document) {
  const fixed = [];
  for (const sel of FIXED_TARGETS) root.querySelectorAll(sel).forEach((e) => { if (visible(e) && !fixed.includes(e)) fixed.push(e); });
  const cards = [...root.querySelectorAll(CARD)].filter((e) =>
    !fixed.includes(e) && visible(e) && e.offsetWidth >= 220 && e.offsetHeight >= 110
    && !(e.parentElement && e.parentElement.closest(CARD)) && !e.querySelector('[style*="position: fixed"]') && e.closest(".fl-root"));
  cards.sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight);
  return [...fixed, ...cards.slice(0, MAX_CARDS)];
}

function reduced() { try { return window.matchMedia("(prefers-reduced-transparency: reduce)").matches; } catch { return false; } }

function sync() {
  state.last = performance.now();
  if (!state.running || !state.enabled || reduced() || !isLensSupported()) { drop(true); return; }
  const want = new Set(pickTargets());
  for (const [el, lens] of state.lenses) if (!want.has(el)) { lens.destroy(); el.style.removeProperty("--glass-lens"); state.lenses.delete(el); }
  for (const el of want) if (!state.lenses.has(el)) state.lenses.set(el, liquidGlass(el, LENS));
}
function drop(all) {
  for (const [el, lens] of state.lenses) { try { lens.destroy(); } catch { /* ignore */ } el.style.removeProperty("--glass-lens"); }
  state.lenses.clear();
  if (all && !state.running && state.obs) { state.obs.disconnect(); state.obs = null; }
}
function schedule() {
  if (state.timer) return;
  const wait = Math.max(150, 600 - (performance.now() - state.last));
  state.timer = setTimeout(() => { state.timer = 0; sync(); }, wait);
}

// هنگام اسکرول/حرکت، فیلتر SVG لنز با کلاس lq-moving موقتاً کنار می‌رود (فقط blur ساده می‌ماند) و بعد از ۱۴۰ms برمی‌گردد.
let movingTimer = 0;
function onMove() {
  const b = document.body; if (!b) return;
  if (!b.classList.contains("lq-moving")) b.classList.add("lq-moving");
  clearTimeout(movingTimer); movingTimer = setTimeout(() => b.classList.remove("lq-moving"), 140);
}
function bindMove(on) {
  const f = on ? window.addEventListener.bind(window) : window.removeEventListener.bind(window);
  f("scroll", onMove, { passive: true, capture: true }); f("wheel", onMove, { passive: true }); f("touchmove", onMove, { passive: true });
  if (!on) { clearTimeout(movingTimer); document.body && document.body.classList.remove("lq-moving"); }
}
export function startLiquidLens({ enabled = true } = {}) {
  if (typeof document === "undefined" || !document.body || typeof MutationObserver === "undefined") return false;
  state.enabled = enabled; state.running = true;
  if (!state.moveBound) { state.moveBound = true; bindMove(true); }
  if (!state.obs) { state.obs = new MutationObserver(schedule); state.obs.observe(document.body, { childList: true, subtree: true }); window.addEventListener("resize", schedule); }
  schedule();
  return isLensSupported();
}
export function setLiquidLensEnabled(on) { state.enabled = !!on; if (state.running) { on ? schedule() : drop(false); } }
export function stopLiquidLens() {
  state.running = false; clearTimeout(state.timer); state.timer = 0;
  if (state.moveBound) { state.moveBound = false; bindMove(false); }
  drop(false);
  if (state.obs) { state.obs.disconnect(); state.obs = null; }
  try { window.removeEventListener("resize", schedule); } catch { /* ignore */ }
}
export const liquidLensCount = () => state.lenses.size;
