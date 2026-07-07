// src/components/Login.jsx
import React, { useState } from "react";
import { COL, neu } from "../theme";

const MODES = { LOGIN: "login", SIGNUP: "signup", RESET: "reset" };

export default function Login({ onLogin, onSignupWithEmail, onLoginWithEmail, onResetPassword }) {
  const [mode, setMode] = useState(MODES.LOGIN);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [username, setUsername] = useState("");
  const [identifier, setIdentifier] = useState(""); // username or email, for login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");

  const resetMessages = () => { setError(""); setInfo(""); };

  const switchMode = (m) => {
    resetMessages();
    setMode(m);
  };

  const handleGoogle = async () => {
    resetMessages();
    setBusy(true);
    try {
      await onLogin();
    } catch (e) {
      setError(e.message || "Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    resetMessages();
    if (!username.trim() || !email.trim() || !password) {
      setError("Please fill in username, email and password.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    try {
      await onSignupWithEmail({ username: username.trim(), email: email.trim(), password });
    } catch (e) {
      setError(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    resetMessages();
    if (!identifier.trim() || !password) {
      setError("Please enter your username/email and password.");
      return;
    }
    setBusy(true);
    try {
      await onLoginWithEmail({ identifier: identifier.trim(), password });
    } catch (e) {
      setError(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    resetMessages();
    if (!resetEmail.trim()) {
      setError("Please enter your email.");
      return;
    }
    setBusy(true);
    try {
      await onResetPassword(resetEmail.trim());
      setInfo("Password reset email sent. Check your inbox.");
    } catch (e) {
      setError(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8 text-center">
      <img src="/logo.png" alt="Focusly" className="w-16 h-16 rounded-3xl object-cover" style={{ boxShadow: "0 10px 24px rgba(91,110,246,0.25)" }} />
      <div>
        <div className="font-display font-bold text-xl" style={{ color: COL.ink }}>Welcome to Focusly</div>
        <div className="font-body text-sm mt-1" style={{ color: COL.sub }}>
          {mode === MODES.SIGNUP ? "Create an account to get started" : mode === MODES.RESET ? "Reset your password" : "Sign in to sync your study time across devices"}
        </div>
      </div>

      <button onClick={handleGoogle} disabled={busy} style={neu(false, 16)}
        className="w-full flex items-center justify-center gap-3 py-3.5 active:scale-[0.98] transition disabled:opacity-60">
        <span className="w-5 h-5 rounded-full flex items-center justify-center font-display font-bold text-[11px] text-white"
          style={{ background: "conic-gradient(from 0deg, #EA4335, #FBBC05, #34A853, #4285F4, #EA4335)" }}>G</span>
        <span className="font-body font-medium text-sm" style={{ color: COL.ink }}>
          {busy ? "Signing in…" : "Continue with Google"}
        </span>
      </button>

      <div className="w-full flex items-center gap-3">
        <div className="flex-1 h-px" style={{ background: COL.sub, opacity: 0.25 }} />
        <span className="font-body text-xs" style={{ color: COL.sub }}>or</span>
        <div className="flex-1 h-px" style={{ background: COL.sub, opacity: 0.25 }} />
      </div>

      {mode === MODES.SIGNUP && (
        <form onSubmit={handleSignup} className="w-full flex flex-col gap-3">
          <Field placeholder="Username" value={username} onChange={setUsername} autoComplete="username" />
          <Field placeholder="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
          <Field placeholder="Password" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
          <SubmitButton busy={busy} label="Create account" />
        </form>
      )}

      {mode === MODES.LOGIN && (
        <form onSubmit={handleLogin} className="w-full flex flex-col gap-3">
          <Field placeholder="Username or email" value={identifier} onChange={setIdentifier} autoComplete="username" />
          <Field placeholder="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
          <SubmitButton busy={busy} label="Log in" />
          <button type="button" onClick={() => switchMode(MODES.RESET)} className="font-body text-xs underline" style={{ color: COL.sub }}>
            Forgot password?
          </button>
        </form>
      )}

      {mode === MODES.RESET && (
        <form onSubmit={handleReset} className="w-full flex flex-col gap-3">
          <Field placeholder="Email" type="email" value={resetEmail} onChange={setResetEmail} autoComplete="email" />
          <SubmitButton busy={busy} label="Send reset link" />
        </form>
      )}

      {error && <div className="font-body text-xs" style={{ color: COL.coral }}>{error}</div>}
      {info && <div className="font-body text-xs" style={{ color: COL.mint }}>{info}</div>}

      <div className="font-body text-xs" style={{ color: COL.sub }}>
        {mode === MODES.SIGNUP ? (
          <>Already have an account?{" "}
            <button onClick={() => switchMode(MODES.LOGIN)} className="font-semibold underline" style={{ color: COL.violet }}>Log in</button>
          </>
        ) : mode === MODES.RESET ? (
          <>Remembered your password?{" "}
            <button onClick={() => switchMode(MODES.LOGIN)} className="font-semibold underline" style={{ color: COL.violet }}>Log in</button>
          </>
        ) : (
          <>Don't have an account?{" "}
            <button onClick={() => switchMode(MODES.SIGNUP)} className="font-semibold underline" style={{ color: COL.violet }}>Create one</button>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ placeholder, type = "text", value, onChange, autoComplete }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete={autoComplete}
      style={neu(true, 14)}
      className="w-full px-4 py-3 font-body text-sm outline-none"
    />
  );
}

function SubmitButton({ busy, label }) {
  return (
    <button type="submit" disabled={busy} style={neu(false, 14)}
      className="w-full py-3 font-body font-medium text-sm active:scale-[0.98] transition disabled:opacity-60">
      {busy ? "Please wait…" : label}
    </button>
  );
}

function friendlyAuthError(e) {
  const code = e?.code || "";
  if (code.includes("wrong-password") || code.includes("invalid-credential")) return "Incorrect password.";
  if (code.includes("user-not-found")) return "No account found with that email/username.";
  if (code.includes("too-many-requests")) return "Too many attempts. Please try again later.";
  if (code.includes("email-already-in-use")) return "That email is already registered.";
  if (code.includes("weak-password")) return "Password must be at least 6 characters.";
  if (code.includes("invalid-email")) return "That email address looks invalid.";
  return e.message || "Something went wrong. Please try again.";
}
