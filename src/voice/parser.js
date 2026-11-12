// Text → Intent. Pipeline: normalise → shared feature extraction (amount, date, method, phone, quantity)
// → weighted cue scoring per intent → intent-specific slot extraction & validation.
// Output is a plain, serialisable object:
//   { intent, label, kind, confidence, slots, missing, errors, warnings, candidates, ambiguous, choices, raw }
import { normalizeText, hasQuestionMark, extractAmount, extractDate, extractMethod, scanNumbers, stripRanges, findSeq, stem } from "./normalize.js";
import { CUES, NEG, QUESTION_WORDS, INVENTORY_GROUP, INVENTORY_IN, INVENTORY_OUT } from "./lexicon.js";
import { INTENTS, INTENT_BY_ID, findTab, matchInventory } from "./intents.js";

export const MIN_SCORE = 3;
const WRITE = new Set(["create_expense", "create_income", "create_sale", "create_order", "create_invoice", "create_customer", "receive_payment", "inventory_in", "inventory_out", "create_note", "create_reminder"]);

// ctx = { today, defaultUnit, jalali, categories, customers, inventory, sales }
export function buildFeatures(raw, ctx = {}) {
  const text = normalizeText(raw);
  const tokens = text.split(" ").filter(Boolean);
  const hasQ = hasQuestionMark(raw) || QUESTION_WORDS.some((w) => findSeq(tokens, w.split(" ")) >= 0);

  // 1) things with a fixed shape are cut out first so their digits can't be mistaken for money
  const ranges = [];
  const date = extractDate(text, ctx);
  if (date?.range) ranges.push(date.range);
  let phone = "";
  tokens.forEach((t, i) => { if (/^09\d{9}$/.test(t)) { phone = phone || t; ranges.push({ start: i, end: i + 1 }); } });
  let invoiceNo = "";
  for (let i = 0; i < tokens.length; i++) {
    if (!["فاکتور", "فاکتورها", "صورتحساب"].includes(tokens[i]) && !(tokens[i] === "صورت" && tokens[i + 1] === "حساب")) continue;
    let j = i + (tokens[i] === "صورت" ? 2 : 1);
    if (tokens[j] === "شماره") j++;
    if (/^\d{1,9}$/.test(tokens[j] || "")) { invoiceNo = tokens[j]; ranges.push({ start: j, end: j + 1 }); break; }
  }
  const mt = stripRanges(tokens, ranges).split(" ").filter(Boolean);
  const maskedText = mt.join(" ");

  // 2) money / quantity on the masked text
  const money = extractAmount(maskedText, ctx.defaultUnit || "rial");
  const { runs } = scanNumbers(maskedText);
  const qrun = runs.find((r) => r.kind === "quantity");
  const qty = qrun ? { ...qrun, noun: qrun.qtyNoun } : null;
  const method = extractMethod(text);
  const tab = findTab(tokens);
  return { raw, text, tokens, mt, hasQ, date, phone, invoiceNo, money, runs, qty, method, tab };
}

function phraseHits(tokens, list) {
  return list.filter(([p]) => findSeq(tokens, p.split(" ")) >= 0);
}

export function scoreIntents(f, ctx = {}) {
  const scores = {};
  INTENTS.forEach((def) => {
    let s = 0;
    phraseHits(f.tokens, CUES[def.id] || []).forEach(([, w]) => { s += w; });
    if (s > 0) phraseHits(f.tokens, NEG[def.id] || []).forEach(([, w]) => { s -= w; });
    if (s > 0 && def.bonus) s += def.bonus(f, ctx);
    if (s > 0 && WRITE.has(def.id) && f.hasQ) s *= 0.4;
    scores[def.id] = s;
  });
  // inventory: direction words only count together with an inventory word or a known item
  const group = INVENTORY_GROUP.some((w) => findSeq(f.tokens, [w]) >= 0);
  const itemHit = !!matchInventory(f.mt, ctx.inventory || []);
  const inDir = INVENTORY_IN.some((w) => findSeq(f.tokens, w.split(" ")) >= 0);
  const outDir = INVENTORY_OUT.some((w) => findSeq(f.tokens, w.split(" ")) >= 0);
  if ((group || itemHit) && !f.hasQ) {
    const base = group ? 2.5 : 1.5;
    if (inDir) scores.inventory_in = base + 3 + (itemHit ? 0.5 : 0);
    else if (!outDir && group) scores.inventory_in = base + 0.7;
    if (outDir) scores.inventory_out = base + 3 + (itemHit ? 0.5 : 0);
  }
  // a bare destination ("داشبورد") is a navigation request
  if (f.tab && f.tokens.length <= 3 && !scores.navigate) scores.navigate = 4;
  if (f.hasQ && !scores.query) scores.query = 1.5;
  return scores;
}

export function parseUtterance(raw, ctx = {}, only) {
  const f = buildFeatures(raw, ctx);
  if (!f.tokens.length) return { raw, intent: null, confidence: 0, candidates: [], slots: {}, missing: [], errors: {}, warnings: [] };
  const scores = scoreIntents(f, ctx);
  const ranked = Object.entries(scores).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]);
  const candidates = ranked.map(([id, score]) => ({ intent: id, score: Math.round(score * 10) / 10, label: INTENT_BY_ID[id].label }));
  const [topId, top] = only ? [only, scores[only] || MIN_SCORE] : ranked[0] || [null, 0];
  if (!topId || top < MIN_SCORE) return { raw, intent: null, confidence: 0, score: top || 0, candidates, slots: {}, missing: [], errors: {}, warnings: [], hasQuestion: f.hasQ };
  const second = ranked.find(([id]) => id !== topId)?.[1] || 0;
  const ambiguous = !only && second >= MIN_SCORE && top - second < 1.2;
  const def = INTENT_BY_ID[topId];
  const ex = def.extract(f, ctx);
  const v = def.validate(ex.slots, ctx);
  let confidence = Math.min(1, top / 6);
  if (!only && top - second < 2) confidence *= 0.75;
  return { raw, intent: topId, label: def.label, kind: def.kind, icon: def.icon, score: top, confidence: Math.round(confidence * 100) / 100, slots: ex.slots, missing: v.missing, errors: v.errors, warnings: ex.warnings || [], choices: ex.choices, candidates, ambiguous };
}

// Slots that always travel together; the first one is the "lead" that decides whether the group is taken.
const GROUPS = [["customerId", "customerName", "saleId", "remaining"], ["itemId", "itemName", "isNew", "before", "unit"], ["firstName", "lastName"], ["tab", "tabLabel"], ["stockId", "stockQty"]];
const FREE_TEXT = new Set(["description", "note", "itemName", "firstName"]);
const empty = (v) => v === undefined || v === null || v === "" || v === 0;

// Re-reads the slots of an already chosen intent from a follow-up sentence («۶۰۰ هزار», «تاریخش دیروز»,
// or the bare answer to the slot we just asked about) and merges them into the pending intent.
export function mergeFollowUp(pending, raw, ctx = {}, askedSlot) {
  const def = INTENT_BY_ID[pending.intent];
  const f = buildFeatures(raw, ctx);
  const fresh = def.extract(f, ctx);
  const slots = { ...pending.slots };
  const changed = [];
  const set = (k, v) => { if (JSON.stringify(slots[k]) !== JSON.stringify(v)) { slots[k] = v; if (!changed.includes(k)) changed.push(k); } };
  const explicit = { amount: !!f.money.amount, date: !!f.date, method: !!f.method, phone: !!f.phone, invoiceNo: !!f.invoiceNo, quantity: !!f.qty || (askedSlot === "quantity" && f.runs.length > 0) };

  const inGroup = new Set(GROUPS.flat());
  Object.keys(fresh.slots).forEach((k) => {
    if (inGroup.has(k)) return;
    const v = fresh.slots[k];
    if (k in explicit) { if (explicit[k] && !empty(v)) set(k, v); return; }
    if (FREE_TEXT.has(k)) { if (askedSlot === k && !empty(v)) set(k, v); return; }
    if (k === "category") { if (!fresh.slots.categoryGuess && !empty(v)) { set(k, v); set("categoryGuess", false); } return; }
    if (k === "categoryKey" || k === "categoryGuess") return;
    if (!empty(v) && askedSlot === k) set(k, v);
  });
  // یادآور: «فردا ساعت ۹» / «یک ساعت دیگه» به‌عنوان پاسخ، تاریخ و ساعت را با هم عوض می‌کند
  if (fresh.slots.whenExplicit && "time" in fresh.slots) { set("date", fresh.slots.date); set("time", fresh.slots.time); if (fresh.slots.repeat && fresh.slots.repeat !== "none") set("repeat", fresh.slots.repeat); }
  for (const g of GROUPS) {
    if (!(g[0] in fresh.slots)) continue;
    const lead = fresh.slots[g[0]];
    const take = g[0] === "firstName" ? askedSlot === "firstName" && !empty(lead)
      : g[0] === "itemId" ? (!empty(lead) || (askedSlot === "itemName" && !empty(fresh.slots.itemName)))
      : !empty(lead);
    if (take) g.forEach((k) => { if (k in fresh.slots) set(k, fresh.slots[k]); });
  }
  if (askedSlot && !changed.includes(askedSlot) && !(askedSlot in explicit && explicit[askedSlot])) {
    const bare = bareValue(def, askedSlot, f);
    if (bare) { Object.entries(bare).forEach(([k, v]) => set(k, v)); }
  }
  const v = def.validate(slots, ctx);
  let warnings = pending.warnings || [];
  if (changed.includes("category") && slots.categoryGuess === false) warnings = warnings.filter((w) => !w.includes("دسته مشخص نبود"));
  return { ...pending, slots, missing: v.missing, errors: v.errors, warnings, choices: fresh.choices, changed };
}

function bareValue(def, slot, f) {
  const field = def.fields.find((x) => x.name === slot);
  if (!field) return undefined;
  if (field.type === "money") return f.money.amount ? { [slot]: f.money.amount } : undefined;
  if (field.type === "number") { const r = f.runs.find((x) => x.value > 0); return r ? { [slot]: r.value } : undefined; }
  if (field.type === "text") { const toks = f.mt.filter((t) => !/^\d+$/.test(t)); return toks.length ? { [slot]: toks.join(" ") } : undefined; }
  if (field.type === "time") { const m = /(\d{1,2})[: ](\d{2})/.exec(f.text); return m ? { [slot]: `${String(m[1]).padStart(2, "0")}:${m[2]}` } : undefined; }
  if (field.type === "tab") return f.tab ? { tab: f.tab.key, tabLabel: f.tab.label } : undefined;
  return undefined;
}
