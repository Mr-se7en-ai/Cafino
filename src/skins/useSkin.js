import { useEffect, useState } from "react";
import { getSkin, onSkinChange } from "./skin.js";
// اشتراک در تغییر پوسته تا کامپوننت با انتخاب جدید دوباره رندر شود
export function useSkin() {
  const [s, setS] = useState(getSkin);
  useEffect(() => onSkinChange((e) => setS(e.detail || getSkin())), []);
  return s;
}
