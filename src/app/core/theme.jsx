// Generated from App.jsx by the module split (v1.50.0). Section: theme
import { getSkin, orangeThemeVars, liquidThemeVars } from "../../skins/skin.js";



// ══════════════════════════════════════════════════════════════════
// THEME (dark / light) — CSS custom properties, applied on the outer wrapper
// ══════════════════════════════════════════════════════════════════
export function getStoredTheme(){try{return localStorage.getItem("cafenet_theme")||"dark";}catch{return "dark";}}

// ══════════════════════════════════════════════════════════════════
// CUSTOM FONT (user-uploaded Persian font, stored as base64 data URI)
// ══════════════════════════════════════════════════════════════════
const FONT_STORAGE="cafenet_customfont";

export function getStoredFont(){try{return JSON.parse(localStorage.getItem(FONT_STORAGE)||"null");}catch{return null;}}

export function saveStoredFont(f){try{if(f)localStorage.setItem(FONT_STORAGE,JSON.stringify(f));else localStorage.removeItem(FONT_STORAGE);return true;}catch{return false;}}

export function appFontFamily(customFont){
  return customFont
    ? `'CafeNetCustomFont','Vazirmatn','Segoe UI',Tahoma,sans-serif`
    : `'Vazirmatn','Segoe UI',Tahoma,sans-serif`;
}

export function CustomFontStyle({customFont}){
  if(!customFont)return null;
  return <style>{`@font-face{font-family:'CafeNetCustomFont';src:url(${customFont.dataUrl});font-weight:normal;font-style:normal;font-display:swap;}`}</style>;
}

export function themeVars(theme){
  if(getSkin()==="orange")return orangeThemeVars(theme);
  if(getSkin()==="liquid")return liquidThemeVars(theme);
  return theme==="light" ? {
    "--bg-app":"#eef2f7",
    "--bg-card":"#ffffff",
    "--border":"#dde3ea",
    "--text-primary":"#1e293b",
    "--text-secondary":"#51607a",
    "--text-muted":"#6b7688",
    "--text-dim":"#94a3b8",
    "--accent-light":"#1d4ed8",
    "--text-light":"#334155",
    "--header-grad-1":"#2563eb",
    "--header-grad-2":"#1d4ed8",
    "--header-border":"#2563eb33",
  } : {
    "--bg-app":"#0f172a",
    "--bg-card":"#1e293b",
    "--border":"#334155",
    "--text-primary":"#e2e8f0",
    "--text-secondary":"#94a3b8",
    "--text-muted":"#64748b",
    "--text-dim":"#475569",
    "--accent-light":"#93c5fd",
    "--text-light":"#cbd5e1",
    "--header-grad-1":"#1e3a5f",
    "--header-grad-2":"#0f2744",
    "--header-border":"#1e40af33",
  };
}
