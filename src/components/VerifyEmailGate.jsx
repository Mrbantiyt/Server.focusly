// src/components/VerifyEmailGate.jsx
//
// Full-screen blocking gate shown instead of the dashboard whenever a
// signed-in user's profile.emailVerified is not true — covers both right
// after signup and after logging back into an account that was never
// verified. The user stays authenticated (send/verify-otp need the ID
// token) but can't reach any app content until they enter the code, or
// they can back out with "Log out" which returns them to the Login screen.
import React, { useState } from "react";
import { Mail, Eye, EyeOff } from "lucide-react";
import { COL, neu } from "../theme";

export default function VerifyEmailGate({ email, onSendOtp, onVerifyOtp, onLogout }) {
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
      setInfo("Email verified! Taking you in…");
      // No need to navigate manually — App.jsx watches profile.emailVerified
      // live via Firestore and swaps this screen out for the dashboard the
      // moment the server-side flag flips.
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
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: COL.bg }}>
      <div
        className="w-full flex flex-col items-center gap-3 p-6"
        style={{ ...neu(false, 22), maxWidth: 340 }}
      >
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: "rgba(255,182,72,0.12)" }}
        >
          <Mail size={22} color={COL.gold} />
        </div>

        <div className="font-display font-bold text-lg" style={{ color: COL.ink }}>
          Verify your email
        </div>
        <div className="font-body text-xs" style={{ color: COL.sub }}>
          Enter the 6-digit code we sent to {email || "your email"} to finish setting up your account.
        </div>

        <form onSubmit={handleVerify} className="w-full flex flex-col gap-3 mt-1">
          <div className="relative w-full">
            <input
              type={visible ? "text" : "password"}
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              autoComplete="one-time-code"
              autoFocus
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

        <button
          onClick={onLogout}
          className="font-body text-xs underline"
          style={{ color: COL.sub, opacity: 0.7 }}
        >
          Log out
        </button>
      </div>
    </div>
  );
}
