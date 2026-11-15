// اجزای مشترک مینی‌اپ (مشتری و کافی‌نت)
import React, { useCallback, useEffect, useState } from "react";
export const Icon = ({ d }) => <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
export function useAsync(fn, deps) {
  const [s, set] = useState({ loading: true, data: null, error: null });
  const run = useCallback(() => { set((x) => ({ ...x, loading: true, error: null })); fn().then((data) => set({ loading: false, data, error: null }), (error) => set({ loading: false, data: null, error })); }, deps);
  useEffect(() => { run(); }, [run]);
  return [s, run];
}
export const Skeleton = ({ rows = 3 }) => <div className="stack" aria-busy="true">{Array.from({ length: rows }, (_, i) => <div key={i} className="card sk" />)}</div>;
export const ErrorBox = ({ error, onRetry }) => <div className="card center" role="alert"><p className="strong">{(error && error.message) || "خطا"}</p><button className="btn" onClick={onRetry}>تلاش دوباره</button></div>;
export const Empty = ({ icon = "M5 4h14v16H5z", title, text }) => <div className="empty"><Icon d={icon} /><p className="strong">{title}</p>{text && <p className="hint">{text}</p>}</div>;
