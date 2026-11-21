// 1.88 — پیامک (ملی پیامک) سمت برنامه: منطق خالص، قرارداد با سرور، و سیم‌کشی صفحه‌ها (ورود/ثبت‌نام، پروفایل، تنظیمات، مشتریان).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeMobile as clientNorm, isMobile, normalizeCode, codeReady, smsParts, renderTemplate, buildRecipients, messageStats, mmss, smsErrorText, MAX_RECIPIENTS, MAX_TEXT, OTP_LENGTH } from "../sms/smsLogic.js";
import { normalizeMobile as serverNorm, smsParts as serverParts } from "../../server/src/lib/sms.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("normalizeMobile: فارسی/عربی/+98/0098/بدون صفر و رد نامعتبر", () => {
  for (const v of ["09123456789", "۰۹۱۲۳۴۵۶۷۸۹", "٠٩١٢٣٤٥٦٧٨٩", "+989123456789", "00989123456789", "989123456789", "9123456789", " 0912 345-6789 "]) assert.equal(clientNorm(v), "09123456789", v);
  for (const v of ["", null, "0912345", "08123456789", "021 88888888", "091234567890", "abc"]) assert.equal(clientNorm(v), "", String(v));
  assert.equal(isMobile("۰۹۱۲۳۴۵۶۷۸۹"), true); assert.equal(isMobile("123"), false);
});

test("نرمال‌سازی کلاینت و سرور یکسان است (قرارداد مشترک)", () => {
  for (const v of ["09123456789", "۰۹۱۲۳۴۵۶۷۸۹", "+989121112233", "9121112233", "0912", "", "98912111223", "0098 912 111 2233"]) assert.equal(clientNorm(v), serverNorm(v), v);
  for (const t of ["", "a", "سلام", "x".repeat(161), "ب".repeat(70), "ب".repeat(71), "ب".repeat(134), "ب".repeat(135)]) assert.equal(smsParts(t), serverParts(t), t.slice(0, 8));
});

test("smsParts: فارسی ۷۰/۶۷ و لاتین ۱۶۰/۱۵۳", () => {
  assert.equal(smsParts(""), 0); assert.equal(smsParts("ب".repeat(70)), 1); assert.equal(smsParts("ب".repeat(71)), 2);
  assert.equal(smsParts("ب".repeat(134)), 2); assert.equal(smsParts("ب".repeat(135)), 3);
  assert.equal(smsParts("a".repeat(160)), 1); assert.equal(smsParts("a".repeat(161)), 2);
});

test("کد: فقط ارقام (فارسی هم)، حداکثر ۶ رقم", () => {
  assert.equal(OTP_LENGTH, 6);
  assert.equal(normalizeCode("۱۲۳ ۴۵۶۷"), "123456"); assert.equal(normalizeCode("12a3"), "123");
  assert.equal(codeReady("۱۲۳۴۵۶"), true); assert.equal(codeReady("12345"), false);
});

test("renderTemplate و buildRecipients: {نام}، بدون شماره، تکراری", () => {
  assert.equal(renderTemplate("سلام {نام}!", "علی رضایی"), "سلام علی رضایی!");
  assert.equal(renderTemplate("سلام {name}", ""), "سلام مشتری گرامی");
  const customers = [
    { id: "a", firstName: "علی", lastName: "رضایی", phone: "۰۹۱۲۳۴۵۶۷۸۹" },
    { id: "b", firstName: "سارا", lastName: "", phone: "" },
    { id: "c", firstName: "تکراری", lastName: "", phone: "09123456789" },
    { id: "d", firstName: "م", lastName: "ح", phone: "+989351112233" },
    { id: "e", firstName: "ن", lastName: "", phone: "021123" },
  ];
  const r = buildRecipients(customers);
  assert.deepEqual(r.recipients.map((x) => x.ref), ["a", "d"]);
  assert.equal(r.recipients[0].phone, "09123456789"); assert.equal(r.recipients[0].name, "علی رضایی");
  assert.deepEqual(r.noPhone.map((x) => x.id), ["b", "e"]);
  assert.deepEqual(buildRecipients(customers, ["d"]).recipients.map((x) => x.ref), ["d"]);
});

test("messageStats: طول، بخش‌ها، لینک، خالی و سقف", () => {
  assert.equal(messageStats("", 3).empty, true);
  const a = messageStats("سلام {نام}", 10); assert.equal(a.parts, 1); assert.equal(a.totalParts, 10); assert.equal(a.hasLink, false);
  assert.equal(messageStats("برو به https://x.ir", 1).hasLink, true); assert.equal(messageStats("سایت ما cafino.ir", 1).hasLink, true);
  assert.equal(messageStats("ب".repeat(MAX_TEXT + 1), 1).tooLong, true);
  assert.equal(MAX_RECIPIENTS, 300);
});

test("mmss و smsErrorText", () => {
  assert.equal(mmss(90), "01:30"); assert.equal(mmss(-5), "00:00");
  assert.match(smsErrorText({ code: "sms_wait" }), /صبر/); assert.match(smsErrorText({ code: "x", message: "پیام سرور" }), /پیام سرور/);
});

test("قرارداد با سرور: سقف‌ها و کدها یکی است", () => {
  const route = read("../../server/src/routes/sms.js");
  assert.match(route, new RegExp(`MAX_RECIPIENTS = ${MAX_RECIPIENTS}, MAX_TEXT = ${MAX_TEXT}`));
  const otp = read("../../server/src/routes/smsAuth.js"); assert.match(otp, /randomCode\(/);
});

test("سیم‌کشی: زیرتب «پیامک» در اتصال، حالت «پیامک» در مشتریان، کارت تأیید شماره در پروفایل", () => {
  const c = read("../app/pages/connectionsPanel.jsx");
  assert.match(c, /key: "sms", label: "پیامک"/); assert.match(c, /cur === "sms" \? <SmsSettingsPage \/>/);
  for (const k of ['"bale"', '"telegram"', '"mini-telegram"', '"mini-bale"', '"ai"']) assert.ok(c.includes(`key: ${k}`), k);
  const cu = read("../app/pages/customers.jsx");
  assert.match(cu, /\["sms","📩 پیامک"\]/); assert.match(cu, /listMode==="sms"\?<SmsCustomersPage customers=\{customers\}\/>/);
  const ui = read("../app/components/ui.jsx"); assert.match(ui, /isApiConnected\(\)&&<PhoneVerifyCard\/>/);
});

test("صفحهٔ ورود: دکمهٔ ورود با پیامک و کادر کد در ثبت‌نام فقط وقتی سرور فعال بودنش را اعلام کرده", () => {
  const a = read("../app/app/AuthScreen.jsx");
  assert.match(a, /smsRegister=remoteAuth&&mode==="register"&&Boolean\(smsCfg\?\.register\)/);
  assert.match(a, /smsLogin=remoteAuth&&mode==="login"&&Boolean\(smsCfg\?\.login\)/);
  assert.match(a, /purpose="login"/); assert.match(a, /purpose="register"/); assert.match(a, /payload\.smsCode=smsCode/);
  assert.match(a, /data-testid="sms-login-toggle"/);
});

test("هیچ رمز/نام‌کاربری پنل پیامک در localStorage یا لاگ کلاینت نوشته نمی‌شود", () => {
  for (const f of ["SmsSettingsPage.jsx", "smsApi.js", "SmsCustomersPage.jsx", "SmsCodeBox.jsx", "PhoneVerifyCard.jsx"]) {
    const s = read(`../sms/${f}`);
    assert.doesNotMatch(s, /localStorage|sessionStorage|console\.(log|info|debug)/, f);
  }
});
