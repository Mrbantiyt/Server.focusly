// src/components/StopwatchCard.jsx
import React from "react";
import { Play, Pause, Flame, RotateCcw } from "lucide-react";
import { COL, neu } from "../theme";
import { fmtHMS } from "../lib/time";

export function StopwatchCard({ seconds, running, onToggle, onReset }) {
  const dayProgress = Math.min(seconds / (24 * 3600), 1);
  const R = 74, C = 2 * Math.PI * R;

  const handleReset = () => {
    if (seconds > 0 && !window.confirm("Reset the stopwatch face to 0:00:00? (Time today is unaffected.)")) return;
    onReset?.();
  };

  return (
    <div style={neu(false, 28)} className="p-6 flex flex-col items-center">
      <div className="w-full flex items-center justify-between mb-4">
        <span className="font-display font-semibold text-sm" style={{ color: COL.ink }}>Study Stopwatch</span>
        <span className="font-body text-xs px-2 py-1 rounded-full" style={{ color: COL.violetDeep, background: "rgba(123,110,246,0.12)" }}>
          resets 12:00 AM
        </span>
      </div>
      <div className="relative" style={{ width: 180, height: 180 }}>
        <svg width="180" height="180" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="90" cy="90" r={R} fill="none" stroke={COL.track} strokeWidth="12" />
          <circle cx="90" cy="90" r={R} fill="none" stroke={COL.violet} strokeWidth="12"
            strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - dayProgress)}
            style={{ transition: "stroke-dashoffset 1s linear" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display font-bold text-2xl" style={{ color: COL.ink }}>{fmtHMS(seconds)}</span>
          <span className="font-body text-xs" style={{ color: COL.sub }}>{running ? "counting up… (adds to Time today)" : "paused"}</span>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-5">
        <button onClick={handleReset} className="flex items-center justify-center w-11 h-11 rounded-full active:scale-95 transition" style={neu(false, 999)}>
          <RotateCcw size={16} color={COL.sub} />
        </button>
        <button onClick={onToggle} className="flex items-center justify-center w-16 h-11 rounded-full active:scale-95 transition"
          style={{ background: `linear-gradient(135deg, ${COL.violet}, ${COL.violetDeep})`, boxShadow: "0 8px 18px rgba(123,110,246,0.45)" }}>
          {running ? <Pause size={18} color="#fff" /> : <Play size={18} color="#fff" />}
        </button>
        <div className="w-11 h-11" />
      </div>
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
