// Intent registry. An intent = id + typed slots + (pure) extraction, validation and a human summary.
// The parser picks WHICH intent; the definitions below say HOW to read its slots from the sentence.
// Nothing in here touches the DOM, storage or React — the host passes everything via `ctx`.
import { tokensOf, tokenScore, findSeq, stem, stripRanges, QTY_NOUNS } from "./normalize.js";
import { REMINDER_INTENTS } from "./reminders.js";
import { CATEGORY_HINTS, ENGLISH_KEYS, INVENTORY_GROUP, INVENTORY_IN, INVENTORY_OUT, TABS, STOPWORDS, CUES } from "./lexicon.js";

const PHONE_RE = /^09\d{9}$/;
const TX_METHOD_KEYS = ["cash", "pos", "transfer", "other"];
export const METHOD_LABELS = { cash: "نقدی", pos: "کارتخوان", transfer: "کارت به کارت", wallet: "کیف پول", credit: "نسیه / بدهکار", free: "رایگان", other: "سایر" };
const fullName = (c) => `${c.firstName || ""} ${c.lastName || ""}`.trim();
const saleRemaining = (s) => Math.max(0, (Number(s.total) || 0) - (Number(s.paid) || 0) - (Number(s.waived) || 0));

// ───────────── helpers on the parsed "features" object (built in parser.js) ─────────────
function cueTokenSet(id, extra = []) {
  const set = new Set(extra.map(stem));
  // content words that double as cues («پرینت زدم») must stay in the description
  const KEEP = new Set(["پرینت", "اسکن", "شارژ", "حقوق", "اجاره", "قبض"]);
  (CUES[id] || []).forEach(([phrase]) => phrase.split(" ").forEach((t) => { if (!KEEP.has(t)) set.add(stem(t)); }));
  return set;
}

// Tokens left after removing everything that is a slot value or a command word.
export function residual(f, id, opts = {}) {
  const kill = [];
  if (opts.money && f.money?.range) kill.push(f.money.range);
  if (opts.qty && f.qty) kill.push({ start: f.qty.start, end: f.qty.noun ? f.qty.numEnd + 1 : f.qty.end });
  let toks = stripRanges(f.mt, kill).split(" ").filter(Boolean);
  if (opts.method && f.method) {
    const m = f.method.match.split(" ");
    const i = findSeq(toks, m);
    if (i >= 0) toks = [...toks.slice(0, i), ...toks.slice(i + m.length)];
  }
  const cue = cueTokenSet(id, opts.extraStop || []);
  return toks.filter((t) => !STOPWORDS.has(t) && !cue.has(stem(t)));
}

// Best customer(s) for a bag of tokens. exact = every name token present.
export function matchCustomer(tokens, customers = []) {
  const bag = tokens.map((t) => t);
  const scored = customers
    .map((c) => {
      const nt = tokensOf(fullName(c));
      if (!nt.length) return null;
      const found = nt.filter((n) => bag.some((t) => t === n || (t.length >= 3 && n.length >= 3 && (n.startsWith(t) || t.startsWith(n))))).length;
      return { customer: c, score: found / nt.length, found, total: nt.length };
    })
    .filter((x) => x && x.found > 0);
  const exact = scored.filter((x) => x.score >= 0.999);
  if (exact.length === 1) return { customer: exact[0].customer, exact: true, candidates: [], used: tokensOf(fullName(exact[0].customer)) };
  if (exact.length > 1) return { customer: null, exact: true, candidates: exact.map((x) => x.customer).slice(0, 5), used: [] };
  const partial = scored.filter((x) => x.score >= 0.5).sort((a, b) => b.score - a.score || b.found - a.found);
  if (partial.length === 1) return { customer: partial[0].customer, exact: false, candidates: [], used: tokensOf(fullName(partial[0].customer)) };
  if (partial.length > 1) {
    if (partial[0].found > partial[1].found) return { customer: partial[0].customer, exact: false, candidates: [], used: tokensOf(fullName(partial[0].customer)) };
    return { customer: null, exact: false, candidates: partial.map((x) => x.customer).slice(0, 5), used: [] };
  }
  return { customer: null, exact: false, candidates: [], used: [] };
}

export function matchInventory(tokens, items = []) {
  const bag = tokens;
  let best = null;
  items.forEach((it) => {
    const nt = tokensOf(it.name);
    if (!nt.length) return;
    const found = nt.filter((n) => bag.some((t) => t === n || (t.length >= 3 && n.length >= 3 && (n.startsWith(t) || t.startsWith(n))))).length;
    const frac = found / nt.length;
    if (frac < 0.5) return;
    const better = !best || frac > best.frac || (frac === best.frac && nt.length > best.len);
    if (better) best = { item: it, frac, len: nt.length, used: nt };
  });
  return best;
}

export function resolveCategory(kind, tokens, list = []) {
  const text = tokens.join(" ");
  if (!list.length) return { category: "", guess: true };
  const byName = list.map((c) => ({ c, s: tokenScore(c.replace(/[()]/g, " "), text) })).filter((x) => x.s >= 0.5 && tokensOf(x.c).some((t) => t.length > 1));
  if (byName.length) {
    byName.sort((a, b) => b.s - a.s);
    return { category: byName[0].c, guess: false };
  }
  for (const [words, targets] of CATEGORY_HINTS[kind] || []) {
    if (!words.some((w) => tokens.some((t) => stem(t) === w || t === w))) continue;
    for (const target of targets) {
      const hit = list.find((c) => c.toLowerCase().includes(target));
      if (hit) return { category: hit, guess: false };
    }
  }
  if (kind === "expense") return { category: list.find((c) => c.includes("سایر")) || list[list.length - 1], guess: true };
  return { category: list.find((c) => c.includes("دلخواه")) || list[0], guess: true };
}

function categoryKey(tokens) {
  for (const [key, words] of Object.entries(ENGLISH_KEYS)) if (words.some((w) => tokens.includes(w))) return key;
  return "";
}

function txMethod(f) {
  const k = f.method?.key;
  return TX_METHOD_KEYS.includes(k) ? k : "cash";
}

// ───────────── transactions (expense / income) ─────────────
function moneyIntent(kind) {
  const id = kind === "expense" ? "create_expense" : "create_income";
  return {
    id, kind: "write", icon: kind === "expense" ? "📉" : "📈",
    label: kind === "expense" ? "ثبت هزینه" : "ثبت درآمد",
    fields: [
      { name: "amount", type: "money", label: "مبلغ", required: true, ask: kind === "expense" ? "مبلغ هزینه چقدر بود؟" : "مبلغ درآمد چقدر بود؟" },
      { name: "category", type: "select", label: "دسته", optionsFrom: kind },
      { name: "description", type: "text", label: "توضیح" },
      { name: "date", type: "date", label: "تاریخ" },
      { name: "method", type: "select", label: "روش", options: TX_METHOD_KEYS.map((k) => [k, METHOD_LABELS[k]]) },
    ],
    bonus: (f) => (f.money?.run?.kind === "money" ? 1 : 0),
    extract(f, ctx) {
      const toks = residual(f, id, { money: true, method: true });
      const { category, guess } = resolveCategory(kind, toks, ctx.categories?.[kind] || []);
      const warnings = [];
      if (guess && category) warnings.push(`دسته مشخص نبود؛ «${category}» انتخاب شد.`);
      return {
        slots: { amount: f.money?.amount || 0, category, description: toks.join(" "), date: f.date?.iso || ctx.today, method: txMethod(f), categoryKey: categoryKey(toks), categoryGuess: guess },
        warnings,
      };
    },
    validate(s) {
      const errors = {};
      if (!(s.amount > 0)) errors.amount = "مبلغ لازم است";
      if (!s.category) errors.category = "دسته را انتخاب کنید";
      return { missing: ["amount"].filter((k) => !(s[k] > 0)), errors };
    },
    summary: (s) => [["مبلغ", { money: s.amount }], ["دسته", s.category], s.description && ["توضیح", s.description], ["تاریخ", { date: s.date }], ["روش", METHOD_LABELS[s.method]]].filter(Boolean),
  };
}

// ───────────── customer ─────────────
const createCustomer = {
  id: "create_customer", kind: "write", icon: "👤", label: "ثبت مشتری جدید",
  fields: [
    { name: "firstName", type: "text", label: "نام", required: true, ask: "نام مشتری چیست؟" },
    { name: "lastName", type: "text", label: "نام خانوادگی" },
    { name: "phone", type: "phone", label: "موبایل" },
    { name: "note", type: "text", label: "یادداشت" },
  ],
  bonus: (f) => (f.phone && f.tokens.includes("مشتری") ? 2 : 0),
  extract(f) {
    const toks = residual(f, "create_customer").filter((t) => !/^\d+$/.test(t));
    const [firstName = "", ...rest] = toks;
    return { slots: { firstName, lastName: rest.join(" "), phone: f.phone || "", note: "" }, warnings: [] };
  },
  validate(s, ctx) {
    const errors = {};
    if (!s.firstName && !s.lastName) errors.firstName = "نام لازم است";
    if (s.phone && !PHONE_RE.test(s.phone)) errors.phone = "شمارهٔ موبایل باید ۱۱ رقم و با ۰۹ شروع شود";
    else if (s.phone) {
      const dup = (ctx.customers || []).find((c) => String(c.phone || "").replace(/\D/g, "") === s.phone);
      if (dup) errors.phone = `این شماره قبلاً برای «${fullName(dup)}» ثبت شده است`;
    }
    return { missing: s.firstName || s.lastName ? [] : ["firstName"], errors };
  },
  summary: (s) => [["نام", `${s.firstName} ${s.lastName}`.trim()], s.phone && ["موبایل", { ltr: s.phone }]].filter(Boolean),
};

// ───────────── sale ─────────────
const createSale = {
  id: "create_sale", kind: "write", icon: "🛒", label: "ثبت فروش",
  fields: [
    { name: "description", type: "text", label: "خدمت / کالا", required: true, ask: "چه چیزی فروخته شد؟" },
    { name: "quantity", type: "number", label: "تعداد" },
    { name: "amount", type: "money", label: "مبلغ کل", required: true, ask: "مبلغ فروش چقدر بود؟" },
    { name: "customerId", type: "customer", label: "مشتری" },
    { name: "method", type: "select", label: "روش پرداخت", options: ["cash", "pos", "transfer", "wallet", "credit", "free"].map((k) => [k, METHOD_LABELS[k]]) },
    { name: "date", type: "date", label: "تاریخ" },
  ],
  bonus: (f) => (f.money?.run?.kind === "money" ? 0.5 : 0),
  extract(f, ctx, intentId = "create_sale") {
    const warnings = [];
    let toks = residual(f, intentId, { money: true, qty: true, method: true, extraStop: ["هر", "تایی", "عددی", "به", "برای"] });
    if (f.tokens.includes("هر")) toks = toks.filter((t) => !QTY_NOUNS.has(t));   // «هر برگ ۱۵ هزار» → the noun is not part of the description
    const m = matchCustomer(toks, ctx.customers);
    let customerId = null, customerName = "", choices = null;
    if (m.customer) {
      customerId = m.customer.id; customerName = fullName(m.customer);
      const used = new Set(m.used);
      toks = toks.filter((t) => !used.has(t));
      if (!m.exact) warnings.push(`مشتری «${customerName}» حدس زده شد؛ لطفاً بررسی کنید.`);
    } else if (m.candidates.length) choices = [...m.candidates.map((c) => ({ id: c.id, label: fullName(c) })), { id: "", label: "مشتری نقدی (بدون مشتری)" }];
    const qty = f.qty && f.qty.value > 0 ? f.qty.value : 1;
    const perUnit = f.tokens.some((t) => ["هر", "تایی", "عددی"].includes(t)) && qty > 1;
    let amount = f.money?.amount ? (perUnit ? f.money.amount * qty : f.money.amount) : 0;
    let description = toks.join(" ");
    const hit = matchInventory(tokensOf(description || f.text), ctx.inventory);
    let stockId = "", stockQty = 0;
    if (hit) {
      stockId = hit.item.id; stockQty = qty;
      if (!description) description = hit.item.name;
      if (!amount && Number(hit.item.salePrice) > 0) { amount = Number(hit.item.salePrice) * qty; warnings.push(`قیمت از انبار برداشته شد (${hit.item.name}).`); }
    }
    const method = ["cash", "pos", "transfer", "wallet", "credit", "free"].includes(f.method?.key) ? f.method.key : "cash";
    return { slots: { description, quantity: qty, amount, customerId, customerName, method, date: f.date?.iso || ctx.today, stockId, stockQty }, warnings, choices: choices ? { customerId: choices } : undefined };
  },
  validate(s, ctx) {
    const errors = {}, missing = [];
    if (!s.description) missing.push("description");
    if (!(s.amount > 0)) missing.push("amount");
    if (["credit", "wallet"].includes(s.method) && !s.customerId) { missing.push("customerId"); errors.customerId = "برای نسیه یا کیف پول، مشتری لازم است"; }
    if (s.method === "wallet" && s.customerId) {
      const c = (ctx.customers || []).find((x) => String(x.id) === String(s.customerId));
      if (c && (Number(c.wallet) || 0) < s.amount) errors.method = "موجودی کیف پول مشتری کافی نیست";
    }
    return { missing, errors };
  },
  summary: (s) => [["شرح", s.description], s.quantity > 1 && ["تعداد", { num: s.quantity }], ["مبلغ کل", { money: s.amount }], ["مشتری", s.customerName || "مشتری نقدی"], ["روش", METHOD_LABELS[s.method]], ["تاریخ", { date: s.date }], s.stockId && ["کسر از انبار", { num: s.stockQty }]].filter(Boolean),
};

// «سفارش جدید» / «فاکتور جدید» register for real, exactly like a sale (confirm card → createSale → undo via cancelSale).
//  • order   → creates the order (kanban card) + its invoice; • invoice → creates the invoice only.
//  When a customer is named and no payment method was spoken, the document is left UNPAID (نسیه) — that is what an order/invoice normally is.
export const SALE_LIKE = new Set(["create_sale", "create_order", "create_invoice"]);
const saleIntent = (id, label, icon, { unpaidByDefault = false } = {}) => ({
  ...createSale, id, label, icon,
  extract(f, ctx) {
    const r = createSale.extract(f, ctx, id);
    if (unpaidByDefault && !f.method && r.slots.customerId != null && r.slots.method === "cash") {
      r.slots.method = "credit";
      r.warnings.push("روش پرداخت را نگفتید؛ پرداخت‌نشده (نسیه) ثبت می‌شود — در کارت قابل تغییر است.");
    }
    return r;
  },
});

// ───────────── receive payment ─────────────
const receivePayment = {
  id: "receive_payment", kind: "write", icon: "💵", label: "دریافت وجه",
  fields: [
    { name: "invoiceNo", type: "text", label: "شمارهٔ فاکتور" },
    { name: "customerId", type: "customer", label: "مشتری" },
    { name: "amount", type: "money", label: "مبلغ (خالی = همهٔ مانده)" },
    { name: "method", type: "select", label: "روش", options: ["cash", "pos", "transfer", "wallet"].map((k) => [k, METHOD_LABELS[k]]) },
    { name: "date", type: "date", label: "تاریخ" },
  ],
  bonus: (f, ctx = {}) => (f.invoiceNo ? 2 : 0) + (matchCustomer(f.mt, ctx.customers || []).customer ? 2.5 : 0),
  extract(f, ctx) {
    const warnings = [];
    const s = { invoiceNo: f.invoiceNo || "", customerId: null, customerName: "", saleId: null, remaining: 0, amount: f.money?.amount || 0, method: ["cash", "pos", "transfer", "wallet"].includes(f.method?.key) ? f.method.key : "cash", date: f.date?.iso || ctx.today };
    let choices;
    if (s.invoiceNo) {
      const sale = (ctx.sales || []).find((x) => !x.cancelled && String(x.number) === String(s.invoiceNo));
      if (sale) { s.saleId = sale.id; s.customerId = sale.customerId ?? null; s.customerName = sale.customerName || ""; s.remaining = saleRemaining(sale); }
    } else {
      const toks = residual(f, "receive_payment", { money: true, method: true });
      const m = matchCustomer(toks, ctx.customers);
      if (m.customer) {
        s.customerId = m.customer.id; s.customerName = fullName(m.customer);
        s.remaining = (ctx.sales || []).filter((x) => !x.cancelled && String(x.customerId) === String(m.customer.id)).reduce((a, x) => a + saleRemaining(x), 0);
        if (!m.exact) warnings.push(`مشتری «${s.customerName}» حدس زده شد؛ لطفاً بررسی کنید.`);
      } else if (m.candidates.length) choices = { customerId: m.candidates.map((c) => ({ id: c.id, label: fullName(c) })) };
    }
    return { slots: s, warnings, choices };
  },
  validate(s) {
    const errors = {}, missing = [];
    if (!s.invoiceNo && s.customerId == null) missing.push("customerId");
    else if (s.invoiceNo && !s.saleId) errors.invoiceNo = `فاکتور شمارهٔ ${s.invoiceNo} پیدا نشد`;
    else if (s.remaining <= 0) errors.amount = "این مورد مانده‌ای برای دریافت ندارد";
    else if (s.amount > s.remaining) errors.amount = "مبلغ بیشتر از مانده است";
    return { missing, errors };
  },
  summary: (s) => [s.invoiceNo && ["فاکتور", { num: s.invoiceNo, raw: true }], ["مشتری", s.customerName || "—"], ["مانده", { money: s.remaining }], ["مبلغ دریافتی", s.amount > 0 ? { money: s.amount } : { money: s.remaining, note: "کل مانده" }], ["روش", METHOD_LABELS[s.method]], ["تاریخ", { date: s.date }]].filter(Boolean),
};

// ───────────── inventory ─────────────
function inventoryIntent(dir) {
  const id = dir === "in" ? "inventory_in" : "inventory_out";
  const extraStop = [...INVENTORY_GROUP, ...INVENTORY_IN, ...INVENTORY_OUT, "تعداد", "عدد", "واحد", "کم", "بیشتر", "به", "از", "شد", "شده", "کن", "کردن", "ثبت"];
  return {
    id, kind: "write", icon: dir === "in" ? "📦" : "📤", label: dir === "in" ? "ورود به انبار" : "خروج از انبار",
    fields: [
      { name: "itemName", type: "text", label: "کالا", required: true, ask: "نام کالا چیست؟" },
      { name: "quantity", type: "number", label: "تعداد", required: true, ask: "چه تعداد؟" },
      { name: "unit", type: "text", label: "واحد" },
    ],
    extract(f, ctx) {
      const warnings = [];
      const qtyRun = f.qty || f.runs.find((r) => r.kind === "number" && r.value > 0 && !/^\d{8,}$/.test(r.raw));
      const quantity = qtyRun ? qtyRun.value : 0;
      const kill = qtyRun ? [{ start: qtyRun.start, end: qtyRun.noun ? qtyRun.numEnd + 1 : qtyRun.end }] : [];
      const toks = stripRanges(f.mt, kill).split(" ").filter(Boolean).filter((t) => !STOPWORDS.has(t) && !extraStop.map(stem).includes(stem(t)));
      const hit = matchInventory(toks, ctx.inventory);
      const s = { itemId: hit ? hit.item.id : null, itemName: hit ? hit.item.name : toks.join(" "), quantity, unit: qtyRun?.qtyNoun || hit?.item.unit || "عدد", isNew: !hit, before: hit ? Number(hit.item.qty) || 0 : 0 };
      if (!hit && s.itemName && dir === "in") warnings.push(`«${s.itemName}» در انبار نیست؛ به‌عنوان کالای جدید اضافه می‌شود.`);
      return { slots: s, warnings };
    },
    validate(s) {
      const errors = {}, missing = [];
      if (!s.itemName) missing.push("itemName");
      if (!(s.quantity > 0)) missing.push("quantity");
      if (dir === "out" && s.itemName && s.isNew) errors.itemName = `کالای «${s.itemName}» در انبار پیدا نشد`;
      else if (dir === "out" && s.quantity > s.before) errors.quantity = `موجودی فعلی ${s.before} است`;
      return { missing, errors };
    },
    summary: (s) => [["کالا", s.itemName], ["تعداد", { num: s.quantity }], s.unit && ["واحد", s.unit], !s.isNew && ["موجودی فعلی", { num: s.before }], !s.isNew && ["موجودی پس از ثبت", { num: dir === "in" ? s.before + s.quantity : Math.max(0, s.before - s.quantity) }]].filter(Boolean),
  };
}

// ───────────── forms / navigation / read-only ─────────────
const formIntent = (id, label, icon, tab, action) => ({
  id, kind: "form", icon, label, fields: [], extract: () => ({ slots: { tab, action }, warnings: [] }), validate: () => ({ missing: [], errors: {} }), summary: () => [["باز می‌شود", `فرم «${label}»`]],
});

const navigate = {
  id: "navigate", kind: "read", icon: "🧭", label: "رفتن به بخش",
  fields: [{ name: "tab", type: "tab", label: "بخش", required: true, ask: "به کدام بخش بروم؟" }],
  bonus: (f) => (f.tab ? 2.5 : -3),
  extract(f) { return { slots: { tab: f.tab?.key || "", tabLabel: f.tab?.label || "" }, warnings: [] }; },
  validate(s) { return { missing: s.tab ? [] : ["tab"], errors: {} }; },
  summary: (s) => [["بخش", s.tabLabel]],
};

const topupSale = {
  id: "topup_sale", kind: "form", icon: "📶", label: "فروش شارژ و بسته", fields: [],
  extract: () => ({ slots: { tab: "topup", action: null }, warnings: [] }), validate: () => ({ missing: [], errors: {} }), summary: () => [["باز می‌شود", "بخش شارژ و بسته"]],
};

const query = {
  id: "query", kind: "read", icon: "❓", label: "پرسش و گزارش", fields: [],
  bonus: (f) => (f.hasQ ? 2 : 0),
  extract: (f) => ({ slots: { question: f.raw }, warnings: [] }), validate: () => ({ missing: [], errors: {} }), summary: (s) => [["پرسش", s.question]],
};

const undo = { id: "undo", kind: "read", icon: "↩️", label: "واگرد آخرین ثبت", fields: [], extract: () => ({ slots: {}, warnings: [] }), validate: () => ({ missing: [], errors: {} }), summary: () => [] };
const help = { id: "help", kind: "read", icon: "💡", label: "راهنما", fields: [], extract: () => ({ slots: {}, warnings: [] }), validate: () => ({ missing: [], errors: {} }), summary: () => [] };

export const INTENTS = [
  moneyIntent("expense"), moneyIntent("income"), createCustomer, createSale, topupSale, receivePayment,
  saleIntent("create_order", "ثبت سفارش", "📋", { unpaidByDefault: true }), saleIntent("create_invoice", "ثبت فاکتور", "🧾", { unpaidByDefault: true }),
  inventoryIntent("in"), inventoryIntent("out"), ...REMINDER_INTENTS, navigate, query, undo, help,
];
export const INTENT_BY_ID = Object.fromEntries(INTENTS.map((i) => [i.id, i]));
export const WRITE_INTENTS = INTENTS.filter((i) => i.kind === "write").map((i) => i.id);

export function findTab(tokens) {
  let best = null;
  TABS.forEach((t) => t.phrases.forEach((ph) => {
    const pt = ph.split(" ");
    const i = findSeq(tokens, pt);
    if (i < 0) return;
    if (!best || pt.length > best.len || (pt.length === best.len && i < best.at)) best = { key: t.key, label: t.label, len: pt.length, at: i };
  }));
  return best;
}
