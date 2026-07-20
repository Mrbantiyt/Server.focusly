// src/components/AchievementUnlockPopup.jsx
//
// One-shot celebration shown when an achievement is newly unlocked. Reward
// coins are already credited server-side by the time this shows (see
// useAchievements.js) — this is purely the "ta-da" moment: icon pop-in,
// unlock chime, then auto-dismiss (or tap to skip early).
import React, { useEffect, useState } from "react";
import * as Icons from "lucide-react";
import { COL, neu } from "../theme";
import { playAchievementUnlockChime } from "../lib/sound";

export default function AchievementUnlockPopup({ achievement, onDone }) {
  const [skippable, setSkippable] = useState(false);
  const Icon = Icons[achievement.icon] || Icons.Award;

  useEffect(() => {
    playAchievementUnlockChime();
    const revealSkip = setTimeout(() => setSkippable(true), 300);
    const finish = setTimeout(() => onDone && onDone(), 2800);
    return () => {
      clearTimeout(revealSkip);
      clearTimeout(finish);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [achievement.id]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(20,18,40,0.6)", cursor: skippable ? "pointer" : "default" }}
      onClick={() => skippable && onDone && onDone()}
    >
      <div
        className="relative w-full max-w-xs rounded-[28px] p-6 flex flex-col items-center text-center au-pop-in"
        style={{
          background: `radial-gradient(circle at 50% 20%, rgba(255,182,72,0.14), ${COL.bg} 65%)`,
          border: `1px solid ${COL.border}`,
        }}
      >
        <span className="font-body text-[11px] uppercase tracking-widest mb-4" style={{ color: COL.gold }}>
          Achievement Unlocked
        </span>

        <div className="relative mb-4 au-badge-in">
          <div className="au-glow-ring" />
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center relative overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${COL.coral}, ${COL.gold})`, boxShadow: "0 10px 30px rgba(255,150,60,0.35)" }}
          >
            {achievement.imageUrl ? (
              <img src={achievement.imageUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <Icon size={34} color="#fff" />
            )}
          </div>
        </div>

        <div className="font-display font-bold text-lg mb-1" style={{ color: COL.ink }}>
          {achievement.name}
        </div>
        <div className="font-body text-xs mb-4" style={{ color: COL.sub }}>
          {achievement.description}
        </div>

        {(achievement.reward > 0 || achievement.xpReward > 0) && (
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {achievement.reward > 0 && (
              <div style={neu(true, 999)} className="px-4 py-2 flex items-center gap-2">
                <Icons.Coins size={14} color={COL.gold} />
                <span className="font-display font-semibold text-sm" style={{ color: COL.ink }}>
                  +{achievement.reward.toLocaleString()} coins
                </span>
              </div>
            )}
            {achievement.xpReward > 0 && (
              <div style={neu(true, 999)} className="px-4 py-2 flex items-center gap-2">
                <Icons.Shield size={14} color={COL.violet} />
                <span className="font-display font-semibold text-sm" style={{ color: COL.ink }}>
                  +{achievement.xpReward.toLocaleString()} XP
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        .au-pop-in { animation: auPopIn 420ms cubic-bezier(0.34,1.56,0.64,1) both; }
        @keyframes auPopIn { 0% { transform: scale(0.8); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        .au-badge-in { animation: auBadgeIn 500ms cubic-bezier(0.34,1.56,0.64,1) 100ms both; }
        @keyframes auBadgeIn {
          0% { transform: scale(0.3) rotate(-10deg); opacity: 0; }
          60% { transform: scale(1.15) rotate(4deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); }
        }
        .au-glow-ring {
          position: absolute; inset: -10px; border-radius: 999px;
          background: radial-gradient(circle, ${COL.gold}55 0%, transparent 70%);
          animation: auGlowPulse 1.6s ease-in-out infinite;
        }
        @keyframes auGlowPulse { 0%, 100% { opacity: 0.5; transform: scale(0.95); } 50% { opacity: 1; transform: scale(1.1); } }
      `}</style>
    </div>
  );
}
