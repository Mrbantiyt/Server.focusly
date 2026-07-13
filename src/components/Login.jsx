// src/components/Login.jsx
import React, { useState, useRef, useEffect } from "react";
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

  const [lampOn, setLampOn] = useState(false);
  const [cordY, setCordY] = useState(0);

  const hitAreaRef = useRef(null);
  const clickSoundRef = useRef(null);
  const dragRef = useRef({ dragging: false, startY: 0, y: 0 });
  const rafRef = useRef(null);

  useEffect(() => {
    try {
      clickSoundRef.current = new Audio("https://assets.codepen.io/605876/click.mp3");
    } catch {
      clickSoundRef.current = null;
    }

    const el = hitAreaRef.current;
    if (!el) return;

    const getY = (e) => (e.touches ? e.touches[0].clientY : e.clientY);

    const springBack = () => {
      const step = () => {
        dragRef.current.y *= 0.7;
        if (Math.abs(dragRef.current.y) < 0.5) dragRef.current.y = 0;
        setCordY(dragRef.current.y);
        if (dragRef.current.y !== 0) {
          rafRef.current = requestAnimationFrame(step);
        }
      };
      step();
    };

    const onStart = (e) => {
      dragRef.current.dragging = true;
      dragRef.current.startY = getY(e);
    };

    const onMove = (e) => {
      if (!dragRef.current.dragging) return;
      if (e.cancelable) e.preventDefault();
      let dy = getY(e) - dragRef.current.startY;
      dy = Math.max(0, Math.min(60, dy));
      dragRef.current.y = dy;
      setCordY(dy);
    };

    const onEnd = () => {
      if (!dragRef.current.dragging) return;
      dragRef.current.dragging = false;
      if (dragRef.current.y > 30) {
        setLampOn((v) => {
          const next = !v;
          clickSoundRef.current?.play().catch(() => {});
          return next;
        });
      }
      springBack();
    };

    el.addEventListener("mousedown", onStart);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onEnd);
    el.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);

    return () => {
      el.removeEventListener("mousedown", onStart);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onEnd);
      el.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

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
    <div
      className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center relative overflow-hidden"
      style={{
        background: lampOn
          ? "radial-gradient(circle at 50% 28%, rgba(255,214,110,0.18), transparent 65%), #1c1f24"
          : "#121417",
        transition: "background 0.6s cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      {/* Lamp */}
      <div className="relative flex justify-center" style={{ width: "100%", maxWidth: 200, height: 190 }}>
        <svg className="w-full h-full" viewBox="0 0 200 300" style={{ overflow: "visible" }}>
          <ellipse
            cx="100" cy="110" rx="60" ry="30"
            style={{ fill: "#ffdb8a", filter: "blur(15px)", opacity: lampOn ? 0.6 : 0, transition: "opacity 0.5s cubic-bezier(0.4,0,0.2,1)" }}
          />
          <rect x="92" y="100" width="16" height="160" rx="8" fill="#d1ccc2" />
          <rect x="60" y="250" width="80" height="12" rx="6" fill="#d1ccc2" />

          <g>
            <line x1="130" y1="110" x2="130" y2={180 + cordY} stroke="#555" strokeWidth="2" />
            <circle cx="130" cy={190 + cordY} r="6" fill="#d4a373" />
            <circle ref={hitAreaRef} cx="130" cy={190 + cordY} r="25" fill="transparent" style={{ cursor: "pointer", touchAction: "none" }} />
          </g>

          <path
            d="M30 110 C 30 50, 170 50, 170 110 C 170 125, 30 125, 30 110 Z"
            style={{
              fill: lampOn ? "#fff" : "#f5f0e6",
              filter: lampOn ? "drop-shadow(0 0 30px rgba(255,255,200,0.4))" : "none",
              transition: "fill 0.5s cubic-bezier(0.4,0,0.2,1)",
            }}
          />
        </svg>
      </div>

      {!lampOn && (
        <div className="font-body text-xs" style={{ color: "#8C8CA1" }}>
          Pull the cord to turn on the light
        </div>
      )}

      {/* Login card, revealed when lamp is on */}
      <div
        className="w-full flex flex-col items-center gap-4"
        style={{
          maxWidth: 340,
          padding: "1.75rem 1.5rem",
          borderRadius: 26,
          background: "rgba(255,255,255,0.05)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
          opacity: lampOn ? 1 : 0,
          transform: lampOn ? "translateY(0)" : "translateY(30px)",
          pointerEvents: lampOn ? "auto" : "none",
          transition: "all 0.7s cubic-bezier(0.175,0.885,0.32,1.275)",
        }}
      >
        <img src="/logo.png" alt="Focusly" className="w-14 h-14 rounded-2xl object-cover" style={{ boxShadow: "0 10px 24px rgba(91,110,246,0.25)" }} />

        <div>
          <div className="font-display font-bold text-lg" style={{ color: "#fff" }}>Welcome to Focusly</div>
          <div className="font-body text-xs mt-1" style={{ color: "#999" }}>
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
            <button type="button" onClick={() => switchMode(MODES.RESET)} className="font-body text-xs underline" style={{ color: "#999" }}>
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

        <div className="font-body text-xs" style={{ color: "#999" }}>
          {mode === MODES.SIGNUP ? (
            <>Already have an account?{" "}
              <button onClick={() => switchMode(MODES.LOGIN)} className="font-semibold underline" style={{ color: "#d4a373" }}>Log in</button>
            </>
          ) : mode === MODES.RESET ? (
            <>Remembered your password?{" "}
              <button onClick={() => switchMode(MODES.LOGIN)} className="font-semibold underline" style={{ color: "#d4a373" }}>Log in</button>
            </>
          ) : (
            <>Don't have an account?{" "}
              <button onClick={() => switchMode(MODES.SIGNUP)} className="font-semibold underline" style={{ color: "#d4a373" }}>Create one</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const fieldStyle = {
  borderRadius: 15,
  border: "1px solid transparent",
  background: "rgba(255,255,255,0.07)",
  color: "#fff",
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
      className="w-full px-4 py-3 font-body text-sm outline-none placeholder-gray-500 focus:border-[#d4a373] focus:bg-white/[0.12] transition"
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
        className="w-full px-4 py-3 pr-11 font-body text-sm outline-none placeholder-gray-500 focus:border-[#d4a373] focus:bg-white/[0.12] transition"
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
        borderRadius: 15,
        background: "linear-gradient(135deg, #bf953f, #fcf6ba, #b38728, #fcf6ba, #aa771c)",
        color: "#121417",
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
