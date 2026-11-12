export function speechRecognitionErrorMessage(code) {
  const messages = {
    "not-allowed": "اجازهٔ میکروفون مسدود است. مجوز میکروفون سایت و دستگاه را فعال کنید.",
    "service-not-allowed": "مرورگر اجازهٔ استفاده از تشخیص گفتار را نمی‌دهد. Chrome یا Edge را امتحان کنید.",
    "audio-capture": "میکروفون پیدا نشد یا در دسترس نیست.",
    network: "سرویس تشخیص گفتار به شبکه وصل نشد. اتصال اینترنت را بررسی کنید.",
    "no-speech": "صدایی دریافت نشد. نزدیک میکروفون واضح صحبت کنید.",
    "language-not-supported": "تشخیص گفتار فارسی در این مرورگر پشتیبانی نمی‌شود.",
    aborted: "شنیدن صدا متوقف شد. دوباره تلاش کنید.",
  };
  return messages[code] || `تشخیص گفتار انجام نشد${code ? ` (کد: ${code})` : ""}. مجوز میکروفون را بررسی کنید یا متن را تایپ کنید.`;
}

export function startPersianSpeechRecognition({ onStart, onResult, onInterim, onError, onEnd, interim = false } = {}) {
  const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  if (!Recognition) throw new Error("تشخیص گفتار در این مرورگر در دسترس نیست. متن را تایپ کنید.");
  if (globalThis.isSecureContext === false) throw new Error("برای میکروفون، برنامه را با HTTPS یا localhost باز کنید.");

  const recognition = new Recognition();
  recognition.lang = "fa-IR";
  recognition.continuous = false;
  recognition.interimResults = Boolean(interim);
  recognition.onstart = () => onStart?.();
  recognition.onresult = event => {
    const results = Array.from(event.results || []);
    const transcript = results.map(result => result[0]?.transcript || "").join(" ").trim();
    if (!transcript) return;
    // with interim results on, partial text goes to onInterim and only the final result to onResult
    if (interim && results.length && !results[results.length - 1].isFinal) onInterim?.(transcript);
    else onResult?.(transcript);
  };
  recognition.onerror = event => onError?.(speechRecognitionErrorMessage(event?.error));
  recognition.onend = () => onEnd?.();
  recognition.start();
  return recognition;
}
