// Dialogue manager: turns utterances into intents, fills missing slots by asking, asks for confirmation
// before anything is written, executes through the business-logic layer and keeps an undo history.
// Pure JS (no React/DOM). The UI subscribes to state changes; tests drive it with fake deps.
import { parseUtterance, mergeFollowUp } from "./parser.js";
import { INTENT_BY_ID, SALE_LIKE, matchInventory } from "./intents.js";
import { interpretReply, normalizeText, parseNumberRun, tokensOf } from "./normalize.js";
import { createExecutors, execute, HELP_TEXT } from "./executors.js";

const AUTO_MIN_CONFIDENCE = 0.85;
let _seq = 0;
const mid = () => `m${Date.now().toString(36)}${(_seq++).toString(36)}`;
const saleRemaining = (s) => Math.max(0, (Number(s.total) || 0) - (Number(s.paid) || 0) - (Number(s.waived) || 0));
const fullName = (c) => `${c.firstName || ""} ${c.lastName || ""}`.trim();

export const INITIAL_STATE = () => ({ phase: "idle", pending: null, asking: null, options: null, messages: [], history: [], busy: false });

// Keeps derived slots consistent after a slot was edited (by voice follow-up or by the card's inputs).
export function recompute(pending, ctx) {
  const s = { ...pending.slots };
  const id = pending.intent;
  if (SALE_LIKE.has(id) || id === "receive_payment") {
    if ("customerId" in s) {
      const c = (ctx.customers || []).find((x) => String(x.id) === String(s.customerId));
      s.customerName = c ? fullName(c) : "";
      if (id === "receive_payment" && !s.invoiceNo) s.remaining = c ? (ctx.sales || []).filter((x) => !x.cancelled && String(x.customerId) === String(c.id)).reduce((a, x) => a + saleRemaining(x), 0) : 0;
    }
  }
  if (id === "receive_payment" && s.invoiceNo) {
    const sale = (ctx.sales || []).find((x) => !x.cancelled && String(x.number) === String(s.invoiceNo));
    s.saleId = sale ? sale.id : null;
    if (sale) { s.customerId = sale.customerId ?? null; s.customerName = sale.customerName || ""; s.remaining = saleRemaining(sale); }
    else { s.remaining = 0; }
  }
  if ((id === "inventory_in" || id === "inventory_out") && pending.slots.itemName !== undefined) {
    const hit = s.itemId != null && (ctx.inventory || []).find((x) => String(x.id) === String(s.itemId) && x.name === s.itemName)
      ? { item: (ctx.inventory || []).find((x) => String(x.id) === String(s.itemId)) }
      : matchInventory(tokensOf(s.itemName), ctx.inventory || []);
    if (hit) { s.itemId = hit.item.id; s.itemName = hit.item.name; s.before = Number(hit.item.qty) || 0; s.isNew = false; if (!pending.slots.unit || pending.slots.unit === "عدد") s.unit = hit.item.unit || s.unit; }
    else { s.itemId = null; s.isNew = true; s.before = 0; }
  }
  if (SALE_LIKE.has(id) && s.stockId == null) s.stockId = "";
  const def = INTENT_BY_ID[id];
  const v = def.validate(s, ctx);
  return { ...pending, slots: s, missing: v.missing, errors: v.errors };
}

export function createDialog({ getContext, deps, getConfig = () => ({}), onChange = () => {}, maxHistory = 30 }) {
  const executors = createExecutors(deps);
  let state = INITIAL_STATE();
  const set = (patch) => { state = { ...state, ...patch }; onChange(state); return state; };
  const say = (text, extra = {}) => ({ id: mid(), role: "assistant", text, ts: Date.now(), ...extra });
  const user = (text, extra = {}) => ({ id: mid(), role: "user", text, ts: Date.now(), ...extra });
  const push = (...msgs) => set({ messages: [...state.messages, ...msgs].slice(-80) });
  const ctx = () => getContext();

  const unresolvedChoice = (p) => Object.keys(p.choices || {}).find((k) => p.choices[k] && p.slots[k] == null);
  const askFor = (pending) => {
    const slot = pending.missing[0] || unresolvedChoice(pending);
    const def = INTENT_BY_ID[pending.intent];
    const field = def.fields.find((x) => x.name === slot);
    if (pending.choices?.[slot]) {
      const opts = pending.choices[slot];
      set({ phase: "choice", pending, asking: slot, options: opts.map((o) => ({ value: o.id, label: o.label })) });
      return say(`${field?.label || slot} را مشخص کنید: ${opts.map((o, i) => `${i + 1}) ${o.label}`).join("، ")}`, { kind: "choice" });
    }
    set({ phase: "ask", pending, asking: slot, options: null });
    return say(field?.ask || `${field?.label || slot} را بگویید.`, { kind: "ask" });
  };

  const present = (pending) => {
    const def = INTENT_BY_ID[pending.intent];
    if (pending.missing.length || unresolvedChoice(pending)) { push(askFor(pending)); return; }
    const hasErr = Object.keys(pending.errors || {}).length > 0;
    const cfg = getConfig();
    const confident = pending.confidence >= AUTO_MIN_CONFIDENCE && !(pending.warnings || []).length && !pending.ambiguous;
    if (!hasErr && cfg.autoRun && def.kind === "write" && confident) { set({ pending }); return confirm(); }
    set({ phase: "confirm", pending, asking: null, options: null });
    const errs = Object.values(pending.errors || {});
    push(say(errs.length ? `${errs.join("؛ ")}. می‌توانید مقدار را اصلاح کنید یا «لغو» بگویید.` : `${def.label} — درست است؟ بگویید «تأیید» یا «لغو»، یا مقدار را اصلاح کنید.`, { kind: "confirm", pendingId: pending.id }));
  };

  const adopt = (parsed) => {
    const pending = { ...parsed, id: mid() };
    const def = INTENT_BY_ID[pending.intent];
    if (def.kind !== "write") return runImmediate(pending);
    present(pending);
  };

  async function runImmediate(pending) {
    const def = INTENT_BY_ID[pending.intent];
    if (pending.missing.length) { push(askFor(pending)); return state; }
    set({ busy: true, phase: "idle", pending: null, asking: null, options: null });
    let res;
    if (pending.intent === "undo") res = await undoLast(true);
    else res = await execute(pending.intent, pending.slots, deps, executors);
    set({ busy: false });
    push(say(res.say, { kind: res.ok ? (res.answer ? "answer" : "done") : "error", details: res.details, intent: pending.intent, label: def.label, navigate: res.navigate }));
    if (res.ok && res.navigate) deps.navigate?.(res.navigate.tab, res.navigate.action);
    return state;
  }

  async function confirm() {
    const pending = state.pending;
    if (!pending || state.busy) return state;
    const fresh = recompute(pending, ctx());
    if (fresh.missing.length || Object.keys(fresh.errors).length) { set({ pending: fresh }); present(fresh); return state; }
    const def = INTENT_BY_ID[fresh.intent];
    set({ busy: true });
    const res = await execute(fresh.intent, fresh.slots, deps, executors);
    set({ busy: false });
    if (!res.ok) {
      push(say(res.say, { kind: "error" }));
      set({ phase: "confirm", pending: fresh });
      return state;
    }
    const entry = { id: mid(), ts: Date.now(), intent: fresh.intent, label: def.label, icon: def.icon, summary: def.summary(fresh.slots, ctx()), say: res.say, undo: res.undo || null, undoNote: res.undoNote || "", undone: false, raw: fresh.raw };
    set({ phase: "idle", pending: null, asking: null, options: null, history: [entry, ...state.history].slice(0, maxHistory) });
    push(say(res.say, { kind: "done", details: res.details, intent: fresh.intent, label: def.label, entryId: entry.id, undoable: !!res.undo }));
    return state;
  }

  async function undoLast(silentPush) {
    const entry = state.history.find((h) => !h.undone);
    if (!entry) return { ok: false, say: "ثبت قابل‌برگشتی در این نشست وجود ندارد." };
    return undoEntry(entry.id, silentPush);
  }

  async function undoEntry(id, silentPush) {
    const entry = state.history.find((h) => h.id === id);
    if (!entry || entry.undone) return { ok: false, say: "این مورد قبلاً برگشته است." };
    if (!entry.undo) return { ok: false, say: entry.undoNote || "این ثبت از اینجا قابل برگشت نیست." };
    let r;
    try { r = await entry.undo.run(); } catch (e) { r = { ok: false, error: e?.message }; }
    if (r && r.ok === false) { const res = { ok: false, say: r.error || "برگشت انجام نشد." }; if (!silentPush) push(say(res.say, { kind: "error" })); return res; }
    set({ history: state.history.map((h) => (h.id === id ? { ...h, undone: true } : h)) });
    const res = { ok: true, say: `برگشت داده شد: ${entry.undo.label}.` };
    if (!silentPush) push(say(res.say, { kind: "done" }));
    return res;
  }

  function cancel(textSay = "لغو شد؛ چیزی ثبت نشد.") {
    if (state.phase === "idle" && !state.pending) return state;
    set({ phase: "idle", pending: null, asking: null, options: null });
    push(say(textSay, { kind: "info" }));
    return state;
  }

  const looksLikeNewCommand = (text, current) => {
    const p = parseUtterance(text, ctx());
    return p.intent && p.score >= 5.5 && p.intent !== current && !p.ambiguous ? p : null;
  };

  // pick from the numbered options (by number, name or a part of the name)
  function pickFrom(options, raw) {
    const text = normalizeText(raw);
    const toks = text.split(" ");
    const run = parseNumberRun(toks, 0);
    if (run && run.value >= 1 && run.value <= options.length && run.end === toks.length) return options[run.value - 1];
    const hits = options.filter((o) => { const ot = tokensOf(o.label); return ot.length && ot.every((t) => toks.some((x) => x === t || (x.length >= 3 && t.startsWith(x)))); });
    if (hits.length === 1) return hits[0];
    const partial = options.filter((o) => tokensOf(o.label).some((t) => toks.some((x) => x.length >= 3 && x === t)));
    return partial.length === 1 ? partial[0] : null;
  }

  async function submit(raw, meta = {}) {
    const text = String(raw || "").trim();
    if (!text || state.busy) return state;
    push(user(text, meta));
    const reply = interpretReply(text);

    // ── waiting for a yes/no ──
    if (state.phase === "confirm" && state.pending) {
      if (reply === "confirm") return confirm();
      if (reply === "cancel") return cancel();
      const merged = mergeFollowUp(state.pending, text, ctx());
      if (merged.changed.length) {
        const fresh = recompute(merged, ctx());
        push(say("اصلاح شد.", { kind: "info" }));
        present(fresh);
        return state;
      }
      const np = looksLikeNewCommand(text, state.pending.intent);
      if (np) { set({ phase: "idle", pending: null }); return startFrom(np); }
      push(say("برای ثبت بگویید «تأیید» و برای انصراف «لغو». برای اصلاح، مقدار جدید را بگویید؛ مثلاً «مبلغ ۶۰۰ هزار تومان» یا «تاریخ دیروز».", { kind: "info" }));
      return state;
    }

    // ── waiting for a slot value ──
    if (state.phase === "ask" && state.pending) {
      if (reply === "cancel") return cancel();
      const np = looksLikeNewCommand(text, state.pending.intent);
      if (np) { set({ phase: "idle", pending: null }); return startFrom(np); }
      const merged = recompute(mergeFollowUp(state.pending, text, ctx(), state.asking), ctx());
      if (!merged.changed.length || merged.missing.includes(state.asking) || (state.asking === unresolvedChoice(merged))) {
        push(say(`متوجه ${INTENT_BY_ID[merged.intent].fields.find((x) => x.name === state.asking)?.label || "مقدار"} نشدم. ${INTENT_BY_ID[merged.intent].fields.find((x) => x.name === state.asking)?.ask || ""}`.trim(), { kind: "ask" }));
        set({ pending: merged });
        return state;
      }
      present(merged);
      return state;
    }

    // ── waiting for a choice (customer, or which intent) ──
    if (state.phase === "choice") {
      if (reply === "cancel") return cancel();
      const opt = state.options && pickFrom(state.options, text);
      if (opt) return choose(opt.value);
      const np = looksLikeNewCommand(text, state.pending?.intent);
      if (np) { set({ phase: "idle", pending: null, options: null }); return startFrom(np); }
      push(say("گزینه را با شماره یا نام بگویید، یا «لغو» بگویید.", { kind: "info" }));
      return state;
    }

    // ── a fresh sentence ──
    if (reply === "cancel") { push(say("باشه. دستور دیگری دارید؟", { kind: "info" })); return state; }
    return startFrom(parseUtterance(text, ctx()));
  }

  async function startFrom(parsed) {
    if (!parsed.intent) {
      const c = ctx();
      const t = normalizeText(parsed.raw);
      if (/^(سلام|درود|وقت بخیر|صبح بخیر|عصر بخیر)(\s|$)/.test(t) && t.split(" ").length <= 3) { push(say("سلام! هر دستوری دارید بگویید؛ مثلاً «هزینه ۵۰۰ هزار تومان بابت کاغذ».", { kind: "info" })); return state; }
      // not a command → try the read-only report engine, otherwise explain
      const ans = deps.answer ? await deps.answer(parsed.raw) : "";
      if (ans && !/متوجه سؤال نشدم/.test(ans)) { push(say(ans, { kind: "answer" })); return state; }
      push(say("متوجه دستور نشدم. نمونه: «هزینه ۵۰۰ هزار تومان بابت کاغذ» یا «مشتری جدید علی رضایی ۰۹۱۲۱۲۳۴۵۶۷». برای دیدن همهٔ دستورها بگویید «راهنما».", { kind: "info", suggestions: HELP_TEXT.slice(0, 3) }));
      void c;
      return state;
    }
    if (parsed.ambiguous) {
      const top = parsed.candidates.filter((x) => x.score >= parsed.score - 1.2).slice(0, 3);
      set({ phase: "choice", pending: { ...parsed, id: mid() }, asking: "__intent", options: top.map((x) => ({ value: x.intent, label: x.label })) });
      push(say(`منظورتان کدام است؟ ${top.map((x, i) => `${i + 1}) ${x.label}`).join("، ")}`, { kind: "choice" }));
      return state;
    }
    adopt(parsed);
    return state;
  }

  async function choose(value) {
    const st = state;
    if (st.phase !== "choice") return state;
    if (st.asking === "__intent") {
      const parsed = parseUtterance(st.pending.raw, ctx(), value);
      set({ phase: "idle", pending: null, options: null });
      adopt({ ...parsed, ambiguous: false });
      return state;
    }
    const slot = st.asking;
    let slots = { ...st.pending.slots, [slot]: value === "" ? null : value };
    let pending = recompute({ ...st.pending, slots, choices: { ...st.pending.choices, [slot]: undefined } }, ctx());
    set({ options: null });
    present(pending);
    return state;
  }

  // edit a slot from the confirmation card
  function edit(slot, value) {
    if (!state.pending) return state;
    let slots = { ...state.pending.slots, [slot]: value };
    if (slot === "category") slots.categoryGuess = false;
    let pending = recompute({ ...state.pending, slots, warnings: slot === "category" ? (state.pending.warnings || []).filter((w) => !w.includes("دسته مشخص نبود")) : state.pending.warnings }, ctx());
    const hasMissing = pending.missing.length > 0;
    set({ pending, phase: hasMissing ? "ask" : "confirm", asking: hasMissing ? pending.missing[0] : null });
    return state;
  }

  return {
    getState: () => state,
    submit, confirm, cancel, choose, edit,
    undoEntry: (id) => undoEntry(id, false),
    undoLast: () => undoLast(false),
    reset: () => set(INITIAL_STATE()),
    pushSystem: (text, extra) => push(say(text, extra)),
  };
}
