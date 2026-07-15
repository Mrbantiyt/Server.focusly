// src/components/VerifyEmailBanner.jsx
import React, { useState } from "react";
import { Mail, X, Eye, EyeOff } from "lucide-react";
import { COL, neu } from "../theme";

// Small dismissible-per-session banner shown above StatusBar while
// profile.emailVerified is not true. Tapping it opens a modal to enter the
// OTP that was emailed at signup (or request a fresh one).
export default function VerifyEmailBanner({ email, onSendOtp, onVerifyOtp }) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 px-3 py-2 mb-3 active:scale-[0.99] transition"
        style={{ ...neu(false, 14), textAlign: "left" }}
      >
        <Mail size={16} color={COL.gold} />
        <span className="font-body text-xs flex-1" style={{ color: COL.ink }}>
          Verify your email{email ? ` (${email})` : ""}
        </span>
        <span
          onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
          className="p-1 -m-1"
          role="button"
          aria-label="Dismiss"
        >
          <X size={14} color={COL.sub} />
        </span>
      </button>

      {open && (
        <OtpModal
          email={email}
          onClose={() => setOpen(false)}
          onSendOtp={onSendOtp}
          onVerifyOtp={onVerifyOtp}
        />
      )}
    </>
  );
}

function OtpModal({ email, onClose, onSendOtp, onVerifyOtp }) {
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [visible, setVisible] = useState(false);

  const handleVerify = async (e) => {
    e.preventDefault();
    setError(""); setInfo("");
    if (!/^\d{6}$/.test(otp.trim())) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    try {
      await onVerifyOtp(otp.trim());
      setInfo("Email verified! You're all set.");
      setTimeout(onClose, 1200);
    } catch (e) {
      setError(e.message || "Incorrect code. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    setError(""); setInfo("");
    setResending(true);
    try {
      await onSendOtp();
      setInfo("A new code has been sent to your email.");
    } catch (e) {
      setError(e.message || "Couldn't send a new code. Please try again shortly.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full flex flex-col gap-3 p-6"
        style={{ ...neu(false, 22), maxWidth: 340 }}
      >
        <div className="flex items-center justify-between">
          <div className="font-display font-bold text-base" style={{ color: COL.ink }}>Verify your email</div>
          <button onClick={onClose} aria-label="Close">
            <X size={18} color={COL.sub} />
          </button>
        </div>

        <div className="font-body text-xs" style={{ color: COL.sub }}>
          Enter the 6-digit code we sent to {email || "your email"}.
        </div>

        <form onSubmit={handleVerify} className="flex flex-col gap-3">
          <div className="relative w-full">
            <input
              type={visible ? "text" : "password"}
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              autoComplete="one-time-code"
              style={{
                borderRadius: 14,
                background: "#FFFFFF",
                boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06), 4px 4px 10px rgba(0,0,0,0.15)",
                color: "#15151C",
                letterSpacing: "0.3em",
              }}
              className="w-full px-4 py-3 pr-11 font-body text-sm text-center outline-none placeholder-gray-400"
            />
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center"
              style={{ color: "#8C8CA1" }}
              aria-label={visible ? "Hide code" : "Show code"}
              tabIndex={-1}
            >
              {visible ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>

          <button
            type="submit"
            disabled={busy}
            style={{
              borderRadius: 14,
              background: "linear-gradient(180deg, #5AA7FF 0%, #3D8CEF 100%)",
              color: "#FFFFFF",
            }}
            className="w-full py-3 font-body font-semibold text-sm active:scale-[0.98] transition disabled:opacity-60"
          >
            {busy ? "Verifying…" : "Verify"}
          </button>
        </form>

        {error && <div className="font-body text-xs text-center" style={{ color: COL.coral }}>{error}</div>}
        {info && <div className="font-body text-xs text-center" style={{ color: COL.mint }}>{info}</div>}

        <button
          onClick={handleResend}
          disabled={resending}
          className="font-body text-xs underline disabled:opacity-60"
          style={{ color: COL.sub }}
        >
          {resending ? "Sending…" : "Resend code"}
        </button>
      </div>
    </div>
  );
}
