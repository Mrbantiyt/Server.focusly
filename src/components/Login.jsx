// src/components/Login.jsx
import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { COL } from "../theme";

const MODES = { LOGIN: "login", SIGNUP: "signup", RESET: "reset" };

export default function Login({ onSignupWithEmail, onLoginWithEmail, onResetPassword }) {
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

      {mode === MODES.SIGNUP && (
        <form onSubmit={handleSignup} className="w-full flex flex-col gap-3">
          <Field placeholder="Username" value={username} onChange={setUsername} autoComplete="username" />
          <Field placeholder="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
          <PasswordField placeholder="Password" value={password} onChange={setPassword} autoComplete="new-password" />
          <SubmitButton busy={busy} label="Create account" />
        </form>
      )}

      {mode === MODES.LOGIN && (
        <form onSubmit={handleLogin} className="w-full flex flex-col gap-3">
          <Field placeholder="Username or email" value={identifier} onChange={setIdentifier} autoComplete="username" />
          <PasswordField placeholder="Password" value={password} onChange={setPassword} autoComplete="current-password" />
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

const fieldStyle = {
  borderRadius: 14,
  background: "#FFFFFF",
  boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06), 4px 4px 10px rgba(0,0,0,0.35)",
  color: "#15151C",
};

function Field({ placeholder, type = "text", value, onChange, autoComplete }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete={autoComplete}
      style={fieldStyle}
      className="w-full px-4 py-3 font-body text-sm outline-none placeholder-gray-400"
    />
  );
}

function PasswordField({ placeholder, value, onChange, autoComplete }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative w-full">
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        style={fieldStyle}
        className="w-full px-4 py-3 pr-11 font-body text-sm outline-none placeholder-gray-400"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center"
        style={{ color: "#8C8CA1" }}
        aria-label={visible ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}

function SubmitButton({ busy, label }) {
  return (
    <button type="submit" disabled={busy}
      style={{
        borderRadius: 14,
        background: "linear-gradient(180deg, #5AA7FF 0%, #3D8CEF 100%)",
        boxShadow: "8px 8px 20px rgba(0,0,0,0.55), -8px -8px 18px rgba(255,255,255,0.035)",
        color: "#FFFFFF",
      }}
      className="w-full py-3 font-body font-semibold text-sm active:scale-[0.98] transition disabled:opacity-60">
      {busy ? "Please wait…" : label}
    </button>
  );
}

function friendlyAuthError(e) {
  const code = e?.code || "";
  if (code.includes("wrong-password") || code.includes("invalid-credential")) return "Incorrect password.";
  if (code.includes("user-not-found")) return "No account found with that email/username.";
  if (code.includes("user-disabled")) return "This account has been disabled. Contact support if you think this is a mistake.";
  if (code.includes("too-many-requests")) return "Too many attempts. Please try again later.";
  if (code.includes("email-already-in-use")) return "That email is already registered.";
  if (code.includes("weak-password")) return "Password must be at least 6 characters.";
  if (code.includes("invalid-email")) return "That email address looks invalid.";
  if (code.includes("network-request-failed")) return "Network error. Check your connection and try again.";
  return "Something went wrong. Please try again.";
}
