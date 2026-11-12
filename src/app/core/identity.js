// Generated from App.jsx by the module split (v1.50.0). Section: identity
import { clearAuthSession, discardLegacyLocalCredentials, getAuthenticatedUser, normalizeAuthUser, setAuthSession, setAuthenticatedUser } from "../../services/auth/session.js";
import { getUsers, registerUser, loginUser, changeUserPassword, startSession, endSession, getSessionEmail, touchSession, MIN_PASSWORD_LENGTH } from "../../services/auth/localAuth.js";



import { GUEST_EMAIL, isGuestMode } from "../../guest/guestMode.js";
// AUTH HELPERS (local email/password — hashed, stored in localStorage)
// ══════════════════════════════════════════════════════════════════
export async function sha256Hex(text){
  const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

// Local (demo/offline) accounts live in src/services/auth/localAuth.js: PBKDF2 + salt, expiring sessions, brute-force throttle.
export const getSession=()=>getSessionEmail();

export function currentActor(){
  if(isGuestMode())return{id:"guest",email:GUEST_EMAIL,name:"کاربر مهمان"};
  const serverUser=getAuthenticatedUser();
  if(serverUser)return{id:serverUser.id||serverUser.email||"",email:serverUser.email||"",name:`${serverUser.firstName||""} ${serverUser.lastName||""}`.trim()||serverUser.name||serverUser.email||"کاربر"};
  const email=getSession();
  const user=getUsers().find(u=>String(u.email||"").toLowerCase()===String(email||"").toLowerCase());
  const name=`${user?.firstName||""} ${user?.lastName||""}`.trim();
  return{id:email||"",email:email||"",name:name||email||"کاربر ناشناس"};
}
