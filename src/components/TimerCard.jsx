// src/components/TimerCard.jsx
import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Flame } from "lucide-react";
import { COL, neu } from "../theme";
import { fmtHMS } from "../lib/time";

// Plays a loud alert chime using the Web Audio API — no audio file/asset
// needed, works even without any other audio permissions granted.
// Returns the AudioContext so the caller can close it later.
function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const playTone = (startTime, freq, peakGain) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.45);
    };
    const now = ctx.currentTime;
    // Louder peak gain (0.3 -> 0.8) and a 3-note rising chime instead of 2
    // soft notes, so a single burst is much more noticeable.
    playTone(now, 880, 0.8);
    playTone(now + 0.22, 880, 0.8);
    playTone(now + 0.44, 1175, 0.85);
    setTimeout(() => { try { ctx.close(); } catch { /* already closed */ } }, 900);
    return ctx;
  } catch {
    // Web Audio not available/blocked — silently skip; the visual alert still shows.
    return null;
  }
}

export function TimerCard({
  remaining, durationSeconds, running, finished, todaySeconds,
  onSetDuration, onStart, onPause, onReset,
}) {
  const [hoursInput, setHoursInput] = useState(Math.floor(durationSeconds / 3600));
  const [minutesInput, setMinutesInput] = useState(Math.floor((durationSeconds % 3600) / 60));
  const alertIntervalRef = useRef(null);

  // Keep playing the chime on a loop while `finished` stays true — this is
  // the "don't stop until the user resets" behavior. The loop is cleared
  // the instant `finished` flips back to false (Reset button, or setting a
  // new duration), and also on unmount, so it can never keep running in
  // the background after the user has moved on.
  useEffect(() => {
    if (finished) {
      playChime(); // immediate first chime
      alertIntervalRef.current = setInterval(playChime, 1800);
    }
    return () => {
      if (alertIntervalRef.current) {
        clearInterval(alertIntervalRef.current);
        alertIntervalRef.current = null;
      }
    };
  }, [finished]);

  const dayProgress = durationSeconds > 0 ? Math.min(1 - remaining / durationSeconds, 1) : 0;
  const R = 74, C = 2 * Math.PI * R;
  const gradId = "timerGrad";

  const applyDuration = () => {
    const h = Math.max(0, parseInt(hoursInput, 10) || 0);
    const m = Math.max(0, Math.min(59, parseInt(minutesInput, 10) || 0));
    onSetDuration(h * 3600 + m * 60);
  };

  const handleReset = () => {
    if (!finished && remaining !== durationSeconds && !window.confirm("Reset the timer back to the set duration? (Time today already saved is unaffected.)")) return;
    onReset?.();
  };

  const numberInputStyle = {
    ...neu(true, 12),
    color: COL.ink,
    width: 56,
    textAlign: "center",
    padding: "8px 0",
    border: `1px solid ${COL.border}`,
  };

  return (
    <div
      style={{
        ...neu(false, 28),
        background: `radial-gradient(circle at 30% 20%, rgba(123,110,246,0.16), ${COL.card} 65%)`,
        border: `1px solid ${COL.border}`,
      }}
      className="p-6 flex flex-col items-center"
    >
      <div className="w-full flex items-center justify-between mb-4">
        <span className="font-display font-semibold text-sm" style={{ color: COL.ink }}>Study Timer</span>
        <span className="font-body text-xs px-2 py-1 rounded-full" style={{ color: COL.gold, background: "rgba(255,182,72,0.12)" }}>
          {fmtHMS(todaySeconds)} today
        </span>
      </div>

      <div className="relative" style={{ width: 180, height: 180 }}>
        <svg width="180" height="180" style={{ transform: "rotate(-90deg)" }}>
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={COL.violet} />
              <stop offset="100%" stopColor={COL.gold} />
            </linearGradient>
          </defs>
          <circle cx="90" cy="90" r={R} fill="none" stroke={COL.track} strokeWidth="10" />
          <circle cx="90" cy="90" r={R} fill="none" stroke={`url(#${gradId})`} strokeWidth="10"
            strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - dayProgress)}
            style={{ transition: "stroke-dashoffset 1s linear" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-bold text-3xl tracking-wide"
            style={{ color: finished ? COL.gold : COL.ink, fontFamily: "'JetBrains Mono', monospace" }}
          >
            {fmtHMS(remaining)}
          </span>
          <span className="font-body text-[11px] uppercase tracking-wider mt-1" style={{ color: COL.sub }}>
            {finished ? "time's up! 🎉" : running ? "counting down…" : "paused"}
          </span>
        </div>
      </div>

      {/* Duration picker — only usable while paused, so it can't disturb a running countdown */}
      {!running && (
        <div className="flex items-center gap-2 mt-5">
          <div className="flex flex-col items-center gap-1">
            <input
              type="number" min="0" max="23" value={hoursInput}
              onChange={(e) => setHoursInput(e.target.value)}
              onBlur={applyDuration}
              style={numberInputStyle}
            />
            <span className="font-body text-[10px] uppercase" style={{ color: COL.sub }}>hrs</span>
          </div>
          <span className="font-display font-bold text-lg" style={{ color: COL.sub, marginTop: -14 }}>:</span>
          <div className="flex flex-col items-center gap-1">
            <input
              type="number" min="0" max="59" value={minutesInput}
              onChange={(e) => setMinutesInput(e.target.value)}
              onBlur={applyDuration}
              style={numberInputStyle}
            />
            <span className="font-body text-[10px] uppercase" style={{ color: COL.sub }}>min</span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mt-5">
        <button
          onClick={handleReset}
          className="flex items-center justify-center w-11 h-11 rounded-full active:scale-95 transition"
          style={finished
            ? { background: `linear-gradient(100deg, ${COL.coral}, ${COL.gold})`, boxShadow: "0 0 0 4px rgba(255,122,133,0.25)", animation: "focusly-pulse 1s ease-in-out infinite" }
            : neu(false, 999)}
        >
          <RotateCcw size={16} color={finished ? "#fff" : COL.sub} />
        </button>
        <button
          onClick={running ? onPause : onStart}
          disabled={!running && remaining <= 0}
          className="flex items-center justify-center w-16 h-11 rounded-full active:scale-95 transition disabled:opacity-40"
          style={{ background: `linear-gradient(100deg, ${COL.violet}, ${COL.violetDeep})`, boxShadow: "0 10px 24px rgba(123,110,246,0.4)" }}
        >
          {running ? <Pause size={18} color="#fff" /> : <Play size={18} color="#fff" />}
        </button>
        <div className="w-11 h-11" />
      </div>
      {finished && (
        <>
          <span className="font-body text-[11px] mt-3" style={{ color: COL.coral }}>
            Tap the reset button to stop the alert
          </span>
          <style>{`@keyframes focusly-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }`}</style>
        </>
      )}
    </div>
  );
}

export function StatCard({ label, value, sub, accent }) {
  return (
    <div style={neu(false, 20)} className="p-4 flex-1">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3" style={{ background: `${accent}22` }}>
        <Flame size={16} color={accent} />
      </div>
      <div className="font-display font-bold text-xl" style={{ color: COL.ink }}>{value}</div>
      <div className="font-body text-xs" style={{ color: COL.sub }}>{label}</div>
      {sub && <div className="font-body text-[11px] mt-1" style={{ color: accent }}>{sub}</div>}
    </div>
  );
}
