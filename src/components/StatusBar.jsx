// src/components/StatusBar.jsx
import React from "react";
import { Flame, Shield } from "lucide-react";
import { COL, neu } from "../theme";
import { fmtCompact } from "../lib/time";

function Pill({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={neu(false, 999)}
      className="flex items-center gap-1.5 px-3 py-1.5 active:scale-95 transition"
    >
      {children}
    </button>
  );
}

export default function StatusBar({ streak, level, coins, mascotSrc, onOpenStreak, onOpenLevel, onOpenStore }) {
  return (
    <div className="flex items-center justify-between">
      <button onClick={onOpenStore} className="active:scale-95 transition">
        <img
          src={mascotSrc || "/mascot-logo.png"}
          alt="Focusly"
          className="w-10 h-10 rounded-2xl object-cover"
          style={{ boxShadow: "4px 4px 10px rgba(163,170,199,0.4), -4px -4px 10px rgba(255,255,255,0.85)" }}
        />
      </button>

      <div className="flex items-center gap-2">
        <Pill onClick={onOpenStreak}>
          <Flame size={14} color={streak > 0 ? COL.coral : COL.sub} />
          <span className="font-display font-bold text-xs" style={{ color: COL.ink }}>{streak}</span>
        </Pill>

        <Pill onClick={onOpenLevel}>
          <Shield size={14} color={COL.violet} />
          <span className="font-display font-bold text-xs" style={{ color: COL.ink }}>Lv {level}</span>
        </Pill>

        <Pill>
          <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold text-[9px]"
            style={{ background: "#F5B301", color: "#fff" }}>F</span>
          <span className="font-display font-bold text-xs" style={{ color: COL.ink }}>{fmtCompact(coins)}</span>
        </Pill>
      </div>
    </div>
  );
}
