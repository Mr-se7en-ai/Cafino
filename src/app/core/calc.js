// ماشین‌حساب بدون eval/new Function: تجزیهٔ بازگشتی عبارت‌های + - * / % و پرانتز.
// خروجی عدد متناهی یا null (ورودی نامعتبر، تقسیم بر صفر، سرریز). رشتهٔ خالی = ۰.
export function evalArithmetic(input) {
  const s = String(input ?? "").replace(/\s+/g, "");
  if (s === "") return 0;
  if (s.length > 200 || !/^[0-9+\-*/.%()]*$/.test(s)) return null;
  let i = 0, depth = 0;
  const fail = () => { throw new Error("bad"); };
  function number() {
    const m = /^\d+(\.\d+)?|^\.\d+/.exec(s.slice(i));
    if (!m) fail();
    i += m[0].length;
    return parseFloat(m[0]);
  }
  function factor() {
    const c = s[i];
    if (c === "-" || c === "+") { i++; const v = factor(); return c === "-" ? -v : v; }
    if (c === "(") {
      if (++depth > 30) fail();
      i++; const v = expr();
      if (s[i] !== ")") fail();
      i++; depth--;
      return v;
    }
    return number();
  }
  function term() {
    let v = factor();
    while (s[i] === "*" || s[i] === "/" || s[i] === "%") {
      const op = s[i++], r = factor();
      v = op === "*" ? v * r : op === "/" ? v / r : v % r;
    }
    return v;
  }
  function expr() {
    let v = term();
    while (s[i] === "+" || s[i] === "-") { const op = s[i++], r = term(); v = op === "+" ? v + r : v - r; }
    return v;
  }
  try {
    const v = expr();
    if (i !== s.length) return null;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  } catch { return null; }
}
