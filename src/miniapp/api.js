// کلاینت API مینی‌اپ: نشست کوتاه‌عمر در حافظه (نه localStorage)؛ با ۴۰۱ یک بار از روی initData دوباره وارد می‌شود.
export function createApi({ initData, cafe, fetchImpl = (...a) => fetch(...a), base = "" }) {
  let token = "", authInfo = null, authing = null;
  const call = async (method, path, body) => {
    const r = await fetchImpl(`${base}/api/miniapp/${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: "no-store", credentials: "omit" });
    let j = null; try { j = await r.json(); } catch {}
    if (!r.ok) { const e = new Error((j && j.error && j.error.message) || "خطا در ارتباط با سرور"); e.status = r.status; e.code = j && j.error && j.error.code || ""; throw e; }
    return j && j.data;
  };
  async function login() {
    if (!authing) authing = call("POST", "auth", { initData, cafe: cafe || undefined }).then((d) => { token = d.token; authInfo = d; return d; }).finally(() => { authing = null; });
    return authing;
  }
  async function authed(method, path, body) {
    if (!token) await login();
    try { return await call(method, path, body); }
    catch (e) { if (e.status !== 401) throw e; token = ""; await login(); return call(method, path, body); }
  }
  return { login, info: () => authInfo, me: () => authed("GET", "me"), home: () => authed("GET", "home"), services: () => authed("GET", "services"), orders: () => authed("GET", "orders"), shop: () => authed("GET", "shop"),
    unlink: () => authed("DELETE", "link"), forgetMe: () => authed("DELETE", "me") };
}
