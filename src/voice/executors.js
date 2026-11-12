// Business-logic layer of the voice assistant: one executor per intent.
// An executor receives the already-validated slots and the host-provided `deps` (the app's own
// functions: add a transaction, create a sale, …) and returns
//   { ok, say, details?, undo?: { label, run }, navigate?: { tab, action }, answer? }
// Nothing here knows about speech, React or localStorage, so every executor is unit-testable with fake deps.
import { INTENT_BY_ID } from "./intents.js";
import { TABS } from "./lexicon.js";

const fail = (say) => ({ ok: false, say });
const num = (n) => String(Number(n) || 0);

export const HELP_TEXT = [
  "«هزینه ۵۰۰ هزار تومان بابت کاغذ»",
  "«درآمد ۲ میلیون تومان پرینت دیروز»",
  "«مشتری جدید علی رضایی ۰۹۱۲۱۲۳۴۵۶۷»",
  "«فروش ۲ برگ پرینت رنگی ۱۵ هزار تومان به علی رضایی»",
  "«دریافت وجه فاکتور شماره ۱۰۲۳» یا «علی رضایی ۵۰۰ هزار تومان پرداخت کرد»",
  "«۵ بسته کاغذ A4 وارد انبار شد» / «۲ عدد کارتریج از انبار خارج کن»",
  "«یادداشت کن کاغذ A4 تمام شده»",
  "«فردا ساعت ۵ عصر یادم بنداز به علی زنگ بزنم» / «یک ساعت دیگه یادآوری کن» / «هر هفته یکشنبه ساعت ۱۰ پشتیبان بگیر»",
  "«چه یادآوری‌هایی دارم؟» / «یادآورهای امروز»",
  "«سفارش جدید»، «فاکتور جدید»، «فروش شارژ»، «باز کن گزارش‌ها»",
  "«فروش امروز چقدر بود؟»، «بدهکارها؟»",
  "«آخری رو پاک کن» برای واگرد آخرین ثبت",
];

export function createExecutors(deps) {
  const f = deps.format || { money: (n) => `${n} ریال`, date: (d) => d, num };

  const tx = (type) => async (s) => {
    const r = await deps.addTransaction({ type, amount: s.amount, category: s.category, desc: s.description || "", date: s.date, method: s.method });
    const label = type === "expense" ? "هزینه" : "درآمد";
    return {
      ok: true,
      say: `${label} ${f.money(s.amount)} در دستهٔ «${s.category}» ثبت شد.`,
      details: r.notes || [],
      undo: { label: `${label} ${f.money(s.amount)}`, run: () => deps.removeTransaction(r.id) },
    };
  };

  // One executor for sale / order / invoice: the real sale engine, so stock, ledger, invoice number, customer history and the
  // offline queue all behave exactly as for a sale typed into the form.
  const SALE_WORDS = { sale: ["فروش", "فروش"], order: ["سفارش", "سفارش"], invoice: ["فاکتور", "فاکتور"] };
  async function sale(s, { kind }) {
    const qty = Number(s.quantity) > 0 ? Number(s.quantity) : 1;
    const price = s.amount / qty;
    const payments = s.method === "credit" ? [] : [{ method: s.method, amount: s.amount, date: s.date }];
    const r = await deps.createSale({
      customerId: s.customerId ?? undefined, walkIn: s.customerId == null, source: "voice", skipOrder: kind !== "order", date: s.date,
      ...(kind === "order" ? { status: "new" } : {}),
      notes: "ثبت از دستیار صوتی",
      items: [{ desc: s.description, title: s.description, qty, price, category: s.description, stockId: s.stockId || undefined, stockQty: s.stockId ? s.stockQty : 0 }],
      payments,
    });
    if (!r.ok) return fail(r.error || `ثبت ${SALE_WORDS[kind][0]} انجام نشد.`);
    const sl = r.sale || {};
    const noun = SALE_WORDS[kind][0];
    return {
      ok: true,
      say: `${noun} ${f.money(s.amount)} ثبت شد${sl.number ? ` (فاکتور ${f.num(sl.number)})` : ""}${s.method === "credit" ? " — پرداخت‌نشده، در حساب مشتری بدهکار شد" : ""}.`,
      details: (r.warnings || []).map((w) => "⚠️ " + w),
      saleId: sl.id,
      undo: sl.id ? { label: `${noun} ${f.money(s.amount)}`, run: () => deps.cancelSale(sl.id, "واگرد دستور صوتی") } : null,
    };
  }

  const map = {
    create_expense: tx("expense"),
    create_income: tx("income"),

    async create_customer(s) {
      const r = await deps.addCustomer({ firstName: s.firstName, lastName: s.lastName, phone: s.phone, note: s.note });
      const name = `${s.firstName} ${s.lastName}`.trim();
      return { ok: true, say: `مشتری «${name}» ثبت شد.`, undo: { label: `مشتری ${name}`, run: () => deps.removeCustomer(r.id) } };
    },

    create_sale: (s) => sale(s, { kind: "sale" }),
    create_order: (s) => sale(s, { kind: "order" }),
    create_invoice: (s) => sale(s, { kind: "invoice" }),

    async receive_payment(s) {
      const amount = s.amount > 0 ? s.amount : s.remaining;
      let r;
      if (s.saleId) r = await deps.receiveSalePayment(s.saleId, amount, s.method, s.date);
      else r = await deps.receiveCustomerPayment(s.customerId, amount, s.method, s.date);
      if (!r.ok) return fail(r.error || "دریافت وجه انجام نشد.");
      const got = r.received ?? amount;
      return { ok: true, say: `${f.money(got)} از «${s.customerName || "مشتری"}» دریافت شد.`, details: r.unused > 0 ? [`${f.money(r.unused)} بیش از مانده بود و ثبت نشد.`] : [], undo: null, undoNote: "دریافت وجه از بخش «فاکتورها» قابل برگشت است." };
    },

    async create_note(s) {
      const r = await deps.addNote({ body: s.body });
      if (!r || r.ok === false) return fail(r?.error || "ثبت یادداشت انجام نشد.");
      return { ok: true, say: "یادداشت ثبت شد.", details: [s.body], undo: { label: "یادداشت", run: () => deps.removeNote(r.id) } };
    },
    async create_reminder(s) {
      const r = await deps.addReminder({ title: s.title, date: s.date, time: s.time, repeat: s.repeat || "none" });
      if (!r || r.ok === false) return fail(r?.error || "ثبت یادآور انجام نشد.");
      return { ok: true, say: `یادآور «${s.title}» برای ${f.date(s.date)} ساعت ${f.num(s.time)} ثبت شد.`, undo: { label: `یادآور ${s.title}`, run: () => deps.removeReminder(r.id) } };
    },
    async show_reminders(s) {
      const list = (await deps.listReminders(s.scope)) || [];
      const names = { all: "باز", today: "امروز", tomorrow: "فردا", overdue: "سررسیدشده" };
      if (!list.length) return { ok: true, answer: true, say: `یادآور ${names[s.scope] || "باز"} ندارید.` };
      return { ok: true, answer: true, say: `${f.num(list.length)} یادآور ${names[s.scope] || "باز"} دارید:`, details: list.slice(0, 6).map((r) => `${r.title} — ${f.date(r.date)} ${f.num(r.time)}${r.overdue ? " (سررسید شده)" : ""}`) };
    },

    inventory_in: (s) => inventory(s, +1),
    inventory_out: (s) => inventory(s, -1),

    topup_sale: async (s) => ({ ok: true, say: "بخش فروش شارژ و بسته باز شد؛ محصول را انتخاب و اطلاعات را بازبینی کنید.", navigate: { tab: s.tab, action: null } }),
    navigate: async (s) => ({ ok: true, say: `بخش «${s.tabLabel || TABS.find((t) => t.key === s.tab)?.label || s.tab}» باز شد.`, navigate: { tab: s.tab, action: null } }),

    async query(s) {
      const text = await deps.answer(s.question);
      return { ok: true, answer: true, say: text };
    },
    async help() { return { ok: true, say: "این‌ها نمونهٔ دستورهایی است که می‌فهمم:", details: HELP_TEXT, answer: true }; },
  };

  async function inventory(s, sign) {
    const r = await deps.adjustInventory({ itemId: s.itemId, itemName: s.itemName, delta: sign * s.quantity, unit: s.unit, create: sign > 0 });
    if (!r.ok) return fail(r.error || "ثبت انبار انجام نشد.");
    return {
      ok: true,
      say: `${sign > 0 ? "ورود" : "خروج"} ${f.num(s.quantity)} ${s.unit || ""} «${s.itemName}» ثبت شد؛ موجودی: ${f.num(r.after)}.`.replace("  ", " "),
      undo: { label: `${sign > 0 ? "ورود" : "خروج"} ${s.itemName}`, run: () => deps.restoreInventory(r) },
    };
  }

  return map;
}

export async function execute(intentId, slots, deps, executors = createExecutors(deps)) {
  const def = INTENT_BY_ID[intentId];
  const run = executors[intentId];
  if (!def || !run) return fail("این دستور هنوز پشتیبانی نمی‌شود.");
  try { return await run(slots); }
  catch (e) { return fail(e?.message ? `خطا در اجرا: ${e.message}` : "خطا در اجرای دستور."); }
}
