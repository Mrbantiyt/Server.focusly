// src/components/Login.jsx
import React, { useState } from "react";
import { COL, neu } from "../theme";

export default function Login({ onLogin }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleClick = async () => {
    setBusy(true);
    setError("");
    try {
      await onLogin();
    } catch (e) {
      setError(e.message || "Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8 text-center">
      <img src="/logo.png" alt="Focusly" className="w-20 h-20 rounded-3xl object-cover" style={{ boxShadow: "0 10px 24px rgba(91,110,246,0.25)" }} />
      <div>
        <div className="font-display font-bold text-xl" style={{ color: COL.ink }}>Welcome to Focusly</div>
        <div className="font-body text-sm mt-1" style={{ color: COL.sub }}>Sign in to sync your study time across devices</div>
      </div>
      <button onClick={handleClick} disabled={busy} style={neu(false, 16)}
        className="w-full flex items-center justify-center gap-3 py-3.5 active:scale-[0.98] transition disabled:opacity-60">
        <span className="w-5 h-5 rounded-full flex items-center justify-center font-display font-bold text-[11px] text-white"
          style={{ background: "conic-gradient(from 0deg, #EA4335, #FBBC05, #34A853, #4285F4, #EA4335)" }}>G</span>
        <span className="font-body font-medium text-sm" style={{ color: COL.ink }}>
          {busy ? "Signing in…" : "Continue with Google"}
        </span>
      </button>
      {error && <div className="font-body text-xs" style={{ color: COL.coral }}>{error}</div>}
    </div>
  );
}
