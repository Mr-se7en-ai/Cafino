// Generated from App.jsx by the module split (v1.50.0). Section: invoiceData
import React, { useState, useEffect, useRef } from "react";
import { INV_STORAGE } from "../core/constants.js";
import { emitDataChange, lsRead, lsWrite, useDataSync } from "./sales.jsx";


const SHOP_STORAGE = "cafenet_shop";

const DEFAULT_INV_OPTS={size:"A4",showStamp:true,showSignature:true,showCard:true,showCardNumber:true,showAccounts:true,showMobile:true,showPhone:true,showWords:true,showBarcode:true};

const DEFAULT_SHOP = {name:"کافی‌نت من",unionName:"",address:"",phone:"",mobile:"",cardNumber:"",cardHolder:"",bankName:"",iban:"",taxId:"",footer:"",logo:null,stamp:null,signature:null,inv:DEFAULT_INV_OPTS};

function normalizeShop(v){const b=(v&&typeof v==="object")?v:{};const savedInv=b.inv||{};const inv={...DEFAULT_INV_OPTS,...savedInv};if(Object.prototype.hasOwnProperty.call(savedInv,"showCard")&&!Object.prototype.hasOwnProperty.call(savedInv,"showCardNumber"))inv.showCardNumber=!!savedInv.showCard;if(Object.prototype.hasOwnProperty.call(savedInv,"showCard")&&!Object.prototype.hasOwnProperty.call(savedInv,"showAccounts"))inv.showAccounts=!!savedInv.showCard;return{...DEFAULT_SHOP,...b,inv};}

export function useInvoices(){
  const [invoices,setInvoices]=useState(()=>{try{return JSON.parse(localStorage.getItem(INV_STORAGE)||"[]");}catch{return[];}});
  useEffect(()=>{lsWrite(INV_STORAGE,invoices);},[invoices]);
  useDataSync(()=>setInvoices(lsRead(INV_STORAGE,[])));
  return [invoices,setInvoices];
}

export function useShopInfo(){
  const read=()=>normalizeShop(lsRead(SHOP_STORAGE,null));
  const [shop,setShopState]=useState(read);
  useDataSync(()=>{const n=read();setShopState(prev=>JSON.stringify(prev)===JSON.stringify(n)?prev:n);});
  const setShop=(v)=>{const n=normalizeShop(typeof v==="function"?v(read()):v);setShopState(n);lsWrite(SHOP_STORAGE,n);emitDataChange();};
  return [shop,setShop];
}
