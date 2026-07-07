// src/components/LevelModal.jsx
import React from "react";
import { X, Shield } from "lucide-react";
import { COL, neu } from "../theme";

export default function LevelModal({ level, xpIntoLevel, xpForNextLevel, onClose }) {
  const pct = Math.min(100, Math.round((xpIntoLevel / xpForNextLevel) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,18,40,0.55)" }}>
      <div className="w-full max-w-sm rounded-[28px] p-6" style={{ background: COL.bg }}>
        <div className="flex items-center justify-between mb-6">
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full" style={neu(false, 999)}>
            <X size={16} color={COL.sub} />
          </button>
          <span className="font-display font-bold text-lg" style={{ color: COL.ink }}>Level</span>
          <div className="w-9 h-9" />
        </div>

        <div className="mb-6">
          <div className="font-display font-bold text-2xl leading-snug" style={{ color: COL.ink }}>
            Elevate your game and keep leveling up
          </div>
        </div>

        <div style={neu(true, 22)} className="p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="font-display font-semibold text-sm" style={{ color: COL.sub }}>Level {level}</span>
            <div className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${COL.violet}, ${COL.violetDeep})` }}>
              <Shield size={16} color="#fff" />
            </div>
          </div>

          <div className="w-full h-2 rounded-full mb-3" style={{ background: COL.track }}>
            <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: COL.violet }} />
          </div>

          <div className="font-body text-xs" style={{ color: COL.sub }}>
            {xpIntoLevel}/{xpForNextLevel} XP
          </div>
        </div>

        <div className="mt-4 font-body text-xs text-center" style={{ color: COL.sub }}>
          Earn 5 XP every 10 seconds you study. Each level-up also pays out 1,000 coins.
        </div>
      </div>
    </div>
  );
}
