// App shell — the application is split into modules under src/app (core → domain → components → pages → app).
import { useState, useEffect } from "react";
import { initializeDataSchema } from "./src/data/migrations.js";
import { isApiConnected, apiResources } from "./src/services/api/client.js";
import { clearAuthSession, discardLegacyLocalCredentials, normalizeAuthUser, setAuthenticatedUser } from "./src/services/auth/session.js";
import { endSession, getSessionEmail, touchSession } from "./src/services/auth/localAuth.js";
import { syncQueue } from "./src/sync/index.js";
import { rememberVerifiedUser, forgetOfflineUser, decideAfterMeFailure, loadOfflineUser, setOfflineActive } from "./src/services/auth/offlineSession.js";
import { ensureGuestSession, seedGuestData } from "./src/guest/seed.js";
import { exitGuestMode, isGuestMode } from "./src/guest/guestMode.js";
import { AuthScreen } from "./src/app/app/AuthScreen.jsx";
import { MainApp } from "./src/app/app/MainApp.jsx";
import { logActivity } from "./src/app/core/activity.js";
import { getSession } from "./src/app/core/identity.js";
import { syncFluentTheme } from "./src/fluent/fluent.js";
import { CustomFontStyle, appFontFamily, getStoredFont, getStoredTheme, themeVars } from "./src/app/core/theme.jsx";
export { APP_VERSION } from "./src/app/core/version.js";

export default function App(){
  // once the server accepts the user again, the offline queue that paused on "401" continues by itself
  const resumeQueue=()=>{try{if(syncQueue.stats().paused==="auth")syncQueue.resume();}catch{}};
  const serverAuthEnabled=isApiConnected();
  useState(()=>{if(isGuestMode()){try{initializeDataSchema();seedGuestData();ensureGuestSession();}catch(e){console.warn("guest seed failed",e&&e.message);}}return 0;});
  const [session,setSessionState]=useState(()=>serverAuthEnabled?null:getSession());
  const [authReady,setAuthReady]=useState(()=>!serverAuthEnabled);
  useEffect(()=>{const result=initializeDataSchema();if(!result.ok)console.warn("Local data schema initialization failed",result.error?.code);},[]);
  useEffect(()=>{
    if(!serverAuthEnabled)return;
    discardLegacyLocalCredentials();
    let alive=true,timer=null;
    const verify=()=>apiResources.auth.me().then(value=>{
        if(!alive)return;const user=normalizeAuthUser(value);setAuthenticatedUser(user);rememberVerifiedUser(user);setOfflineActive(false);setSessionState(user);resumeQueue();return true;
      }).catch(error=>{
        if(!alive)return;
        const d=decideAfterMeFailure(error);
        if(d.action==="offline"){            // closed and re-opened without internet → keep working; identity is re-verified later
          setAuthenticatedUser(d.user);setOfflineActive(true);setSessionState(d.user);
          // while offline the remembered identity has an expiry (owner 24 h / staff 8 h or the server's offlinePolicy): when it runs out, sign-in (online) is required again
          if(!timer)timer=setInterval(()=>{if(!alive)return;if(!loadOfflineUser()){try{sessionStorage.setItem("cafenet_offline_expired","1");}catch{}forgetOfflineUser();clearAuthSession();setSessionState(null);clearInterval(timer);timer=null;return;}if(navigator.onLine!==false)verifyLater();},45000);
          return false;
        }
        forgetOfflineUser();clearAuthSession();setSessionState(null);return false;
      });
    const verifyLater=()=>apiResources.auth.me().then(value=>{if(!alive)return;const user=normalizeAuthUser(value);setAuthenticatedUser(user);rememberVerifiedUser(user);setOfflineActive(false);setSessionState(user);resumeQueue();if(timer){clearInterval(timer);timer=null;}})
      .catch(error=>{if(!alive)return;if(error&&(error.status===401||error.status===403)){forgetOfflineUser();clearAuthSession();setSessionState(null);if(timer){clearInterval(timer);timer=null;}}});
    const onOnline=()=>{if(timer)verifyLater();};
    window.addEventListener("online",onOnline);
    verify().finally(()=>{if(alive)setAuthReady(true);});
    return()=>{alive=false;if(timer)clearInterval(timer);window.removeEventListener("online",onOnline);};
  },[serverAuthEnabled]);
  const [theme,setThemeState]=useState(()=>getStoredTheme());
  const [customFont,setCustomFont]=useState(()=>getStoredFont());
  useEffect(()=>{syncFluentTheme(theme);},[theme]);
  const setTheme=(t)=>{setThemeState(t);try{localStorage.setItem("cafenet_theme",t);}catch{}};
  // local sessions expire (idle 2 h / absolute 12 h) and die when the password is changed in another tab
  useEffect(()=>{
    if(serverAuthEnabled||!session||isGuestMode())return;
    const check=()=>{if(!getSessionEmail()){setSessionState(null);}};
    const act=()=>touchSession();
    const iv=setInterval(check,20000);
    window.addEventListener("storage",check);
    ["pointerdown","keydown"].forEach(ev=>window.addEventListener(ev,act,{passive:true}));
    return()=>{clearInterval(iv);window.removeEventListener("storage",check);["pointerdown","keydown"].forEach(ev=>window.removeEventListener(ev,act));};
  },[serverAuthEnabled,session]);
  const logout=async()=>{if(isGuestMode()){exitGuestMode();return;}logActivity("خروج از حساب","");if(serverAuthEnabled){try{await apiResources.auth.logout();}catch{}}forgetOfflineUser();clearAuthSession();endSession();setSessionState(null);};
  return(
    <>
      <CustomFontStyle customFont={customFont}/>
      {!authReady
        ?<div style={{...themeVars(theme),minHeight:"100vh",display:"grid",placeItems:"center",background:"var(--bg-app)",color:"var(--text-secondary)",fontFamily:appFontFamily(customFont)}}>در حال بررسی نشست کاربر با سرور…</div>
        :!session
        ?<AuthScreen onLoggedIn={value=>{setAuthenticatedUser(typeof value==="object"?value:null);if(value&&typeof value==="object")rememberVerifiedUser(value);setSessionState(value);resumeQueue();}} theme={theme} customFont={customFont}/>
        :<MainApp onLogout={logout} theme={theme} setTheme={setTheme} customFont={customFont} setCustomFont={setCustomFont} userEmail={typeof session==="string"?session:session.email} mustChangePassword={!!(typeof session==="object"&&session.mustChangePassword)} onPasswordChanged={()=>setSessionState(current=>current&&typeof current==="object"?{...current,mustChangePassword:false}:current)}/>
      }
    </>
  );
}
