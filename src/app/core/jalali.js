// Generated from App.jsx by the module split (v1.50.0). Section: jalali
import { p2 } from "../domain/backup.js";


// ══════════════════════════════════════════════════════════════════
// JALALI CONVERSION
// ══════════════════════════════════════════════════════════════════
// ── Gregorian <-> Julian Day Number (Fliegel & Van Flandern, standard & widely verified) ──
function _fdiv(a,b){return Math.floor(a/b);}

function _fmod(a,b){return a-Math.floor(a/b)*b;}

function _gregorianToJDN(gy,gm,gd){
  const a=_fdiv(14-gm,12);
  const y=gy+4800-a;
  const m=gm+12*a-3;
  return gd+_fdiv(153*m+2,5)+365*y+_fdiv(y,4)-_fdiv(y,100)+_fdiv(y,400)-32045;
}

function _jdnToGregorian(jdn){
  const a=jdn+32044;
  const b=_fdiv(4*a+3,146097);
  const c=a-_fdiv(146097*b,4);
  const d=_fdiv(4*c+3,1461);
  const e=c-_fdiv(1461*d,4);
  const m=_fdiv(5*e+2,153);
  const gd=e-_fdiv(153*m+2,5)+1;
  const gm=m+3-12*_fdiv(m,10);
  const gy=100*b+d-4800+_fdiv(m,10);
  return [gy,gm,gd];
}

// ── Jalali <-> Julian Day Number: 33-year leap rule, anchored on Nowruz 1405 = 21 Mar 2026 (matches the official calendar for 1178–1633) ──
function _jLeap(y){return _fmod(25*y+11,33)<8;}

const _J_ANCHOR_Y=1405,_J_MIN=1,_J_MAX=3500;

let _jStarts=null;

function _jYearStart(y){
  if(!_jStarts){
    _jStarts={};_jStarts[_J_ANCHOR_Y]=_gregorianToJDN(2026,3,21);
    for(let k=_J_ANCHOR_Y;k<_J_MAX;k++)_jStarts[k+1]=_jStarts[k]+(_jLeap(k)?366:365);
    for(let k=_J_ANCHOR_Y-1;k>=_J_MIN-1;k--)_jStarts[k]=_jStarts[k+1]-(_jLeap(k)?366:365);
  }
  return _jStarts[Math.min(_J_MAX,Math.max(_J_MIN-1,y))];
}

function _jalaliToJDN(jy,jm,jd){
  return _jYearStart(jy)+(jm<=7?(jm-1)*31:186+(jm-7)*30)+jd-1;
}

function _jdnToJalali(jdn){
  let jy=_J_ANCHOR_Y+Math.floor((jdn-_jYearStart(_J_ANCHOR_Y))/365.2424);
  jy=Math.min(_J_MAX-1,Math.max(_J_MIN,jy));
  while(jy>_J_MIN&&_jYearStart(jy)>jdn)jy--;
  while(jy<_J_MAX-1&&_jYearStart(jy+1)<=jdn)jy++;
  const yday=jdn-_jYearStart(jy)+1;
  const jm=yday<=186?Math.ceil(yday/31):Math.ceil((yday-6)/30);
  const jd=yday-(jm<=7?(jm-1)*31:186+(jm-7)*30);
  return [jy,jm,jd];
}

export function gregorianToJalali(gy,gm,gd){return _jdnToJalali(_gregorianToJDN(gy,gm,gd));}

export function jalaliToGregorian(jy,jm,jd){return _jdnToGregorian(_jalaliToJDN(jy,jm,jd));}

export function dateToJalali(iso){const[y,m,d]=iso.split("-").map(Number);return gregorianToJalali(y,m,d);}

export function jalaliToIso(jy,jm,jd){const[gy,gm,gd]=jalaliToGregorian(jy,jm,jd);return `${gy}-${p2(gm)}-${p2(gd)}`;}

export function todayJalali(){const n=new Date();return gregorianToJalali(n.getFullYear(),n.getMonth()+1,n.getDate());}

export function todayIso(){return new Date().toISOString().split("T")[0];}

export function jalaliMonthDays(jy,jm){if(jm<=6)return 31;if(jm<=11)return 30;const[a,b,c]=jalaliToGregorian(jy,12,30);const[ry,rm,rd]=gregorianToJalali(a,b,c);return ry===jy&&rm===12&&rd===30?30:29;}

export function jalaliFirstWeekday(jy,jm){const[gy,gm,gd]=jalaliToGregorian(jy,jm,1);return(new Date(gy,gm-1,gd).getDay()+1)%7;}
