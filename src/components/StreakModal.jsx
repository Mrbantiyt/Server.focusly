// src/components/StreakModal.jsx
//
// Streak UI — visuals/animations come from the StreakFlow design (ignite
// sequence -> flame burst -> glass calendar), but ALL data is real: `streak`
// and `streakDays` are passed in from useGameStats(), which mirrors
// users/{uid}.streak / users/{uid}.streakDays as kept up to date by
// registerDailyLogin() in lib/firestore.js (see that file for the actual
// continue/break day-over-day logic). This component does no local
// computation or persistence of its own — it only renders whatever the
// backend says the streak currently is.
import React, { useEffect, useState } from "react";
import { X, Flame, ChevronLeft, ChevronRight, CheckCircle2, RotateCcw } from "lucide-react";
import { COL, neu } from "../theme";
import { dayKeyFor } from "../lib/time";
import { isStreakRestoreEligible, restoreStreak } from "../lib/firestore";

export const STREAK_RESTORE_COST = 10000;

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function dayKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/* ---------------------------------------------------------------------- */
/* Flame icon — shared visual for both the ignite intro and the settled   */
/* header chip. `ignited` toggles the lit vs. unlit gradient state.       */
/* ---------------------------------------------------------------------- */
function StreakFlameIcon({ ignited = true, size = 96 }) {
  const w = 200, h = 260;
  return (
    <div className="sm-flame-wrapper" style={{ width: size, height: size * 1.3 }}>
      <div className={`sm-flame-glow ${ignited ? "sm-flame-glow--lit" : ""}`} />
      <div className={`sm-flame-svg ${ignited ? "sm-flame-svg--lit" : ""}`} style={{ width: "100%", height: "100%" }}>
        <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" style={{ overflow: "visible" }}>
          <defs>
            <linearGradient id="smOuterGrad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={ignited ? "#d81f0a" : "#2a2a2a"} />
              <stop offset="30%" stopColor={ignited ? "#ff4d1a" : "#333333"} />
              <stop offset="65%" stopColor={ignited ? "#ff9433" : "#3a3a3a"} />
              <stop offset="100%" stopColor={ignited ? "#ffcb70" : "#454545"} />
            </linearGradient>
            <linearGradient id="smMidGrad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={ignited ? "#ff5214" : "#333333"} />
              <stop offset="40%" stopColor={ignited ? "#ff9a2e" : "#3d3d3d"} />
              <stop offset="100%" stopColor={ignited ? "#ffe38a" : "#4a4a4a"} />
            </linearGradient>
            <linearGradient id="smCoreGrad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={ignited ? "#ffa930" : "#3a3a3a"} />
              <stop offset="50%" stopColor={ignited ? "#fff0a8" : "#4a4a4a"} />
              <stop offset="100%" stopColor={ignited ? "#ffffff" : "#555555"} />
            </linearGradient>
            <filter id="smBlurSoft" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.1" />
            </filter>
          </defs>

          <g className={ignited ? "sm-flame-sway" : ""}>
            {ignited && (
              <>
                <path fill="#ff5a1f" opacity="0.85">
                  <animate
                    attributeName="d"
                    dur="1.4s"
                    repeatCount="indefinite"
                    values="
                      M78,236 C50,214 42,176 56,140 C56,168 64,190 82,204 C76,214 76,226 78,236 Z;
                      M74,234 C44,210 38,170 54,132 C52,162 62,186 80,202 C72,212 72,224 74,234 Z;
                      M78,236 C50,214 42,176 56,140 C56,168 64,190 82,204 C76,214 76,226 78,236 Z
                    "
                  />
                </path>
                <path fill="#ff8028" opacity="0.85">
                  <animate
                    attributeName="d"
                    dur="1.65s"
                    repeatCount="indefinite"
                    values="
                      M122,236 C150,214 158,176 144,140 C144,168 136,190 118,204 C124,214 124,226 122,236 Z;
                      M128,234 C158,208 164,168 146,132 C148,162 138,186 120,202 C126,212 126,224 128,234 Z;
                      M122,236 C150,214 158,176 144,140 C144,168 136,190 118,204 C124,214 124,226 122,236 Z
                    "
                  />
                </path>
              </>
            )}

            <path fill="url(#smOuterGrad)">
              {ignited ? (
                <animate
                  attributeName="d"
                  dur="1.1s"
                  repeatCount="indefinite"
                  values="
                    M100,10 C86,42 74,66 66,92 C56,122 40,140 40,168 C40,204 66,236 100,238 C134,236 160,204 160,168 C160,140 144,122 134,92 C126,66 114,42 100,10 Z;
                    M104,4 C90,38 72,62 62,90 C50,122 36,142 38,170 C40,206 68,236 100,238 C132,236 160,206 158,168 C156,140 142,120 132,88 C122,62 110,36 104,4 Z;
                    M97,16 C84,46 76,68 68,94 C58,124 44,142 44,168 C44,202 68,234 100,238 C132,234 156,202 156,166 C156,140 142,124 132,96 C124,68 110,46 97,16 Z;
                    M100,10 C86,42 74,66 66,92 C56,122 40,140 40,168 C40,204 66,236 100,238 C134,236 160,204 160,168 C160,140 144,122 134,92 C126,66 114,42 100,10 Z
                  "
                />
              ) : (
                <path fill="url(#smOuterGrad)" d="M100,10 C86,42 74,66 66,92 C56,122 40,140 40,168 C40,204 66,236 100,238 C134,236 160,204 160,168 C160,140 144,122 134,92 C126,66 114,42 100,10 Z" />
              )}
            </path>

            <path fill="url(#smMidGrad)">
              {ignited && (
                <animate
                  attributeName="d"
                  dur="0.8s"
                  repeatCount="indefinite"
                  values="
                    M100,40 C90,64 80,82 74,102 C66,124 56,138 56,162 C56,190 76,212 100,214 C124,212 144,190 144,162 C144,138 134,124 126,102 C120,82 110,64 100,40 Z;
                    M103,34 C92,60 78,80 70,100 C60,124 52,140 54,164 C56,192 78,212 100,214 C122,212 144,192 142,162 C140,138 130,122 122,98 C114,80 104,58 103,34 Z;
                    M97,44 C88,66 82,84 76,104 C68,126 60,138 60,160 C60,188 80,212 100,214 C120,212 140,188 138,160 C138,138 128,124 122,102 C116,82 106,64 97,44 Z;
                    M100,40 C90,64 80,82 74,102 C66,124 56,138 56,162 C56,190 76,212 100,214 C124,212 144,190 144,162 C144,138 134,124 126,102 C120,82 110,64 100,40 Z
                  "
                />
              )}
            </path>

            <path fill="url(#smCoreGrad)" filter="url(#smBlurSoft)">
              {ignited && (
                <animate
                  attributeName="d"
                  dur="0.5s"
                  repeatCount="indefinite"
                  values="
                    M100,84 C92,102 84,116 82,134 C80,154 88,172 100,174 C112,172 120,154 118,134 C116,116 108,102 100,84 Z;
                    M102,78 C94,98 82,114 82,132 C82,154 90,172 100,174 C110,172 118,154 118,132 C118,114 110,96 102,78 Z;
                    M98,90 C90,106 86,118 82,136 C80,154 88,172 100,174 C112,172 120,154 118,136 C114,120 106,106 98,90 Z;
                    M100,84 C92,102 84,116 82,134 C80,154 88,172 100,174 C112,172 120,154 118,134 C116,116 108,102 100,84 Z
                  "
                />
              )}
            </path>
          </g>
        </svg>

        {ignited && (
          <>
            <span className="sm-spark sm-spark-1" />
            <span className="sm-spark sm-spark-2" />
            <span className="sm-spark sm-spark-3" />
            <span className="sm-spark sm-spark-4" />
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Main modal.                                                             */
/*                                                                          */
/* Props (unchanged from the previous StreakModal, still wired from       */
/* App.jsx -> gameStats, which itself comes from Firestore):              */
/*   streak      — current streak count (number)                          */
/*   streakDays  — { "YYYY-MM-DD": true, ... } map of completed days       */
/*   onClose     — close handler                                          */
/* ---------------------------------------------------------------------- */
export default function StreakModal({ streak, streakDays, lastStreakDay, uid, coins = 0, onClose }) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [phase, setPhase] = useState("ignite"); // ignite -> flare -> settled
  const [restoreState, setRestoreState] = useState("idle"); // idle -> pending -> done | error
  const [restoreError, setRestoreError] = useState(null);

  const todayKey = dayKeyFor(now);
  const yesterdayD = new Date(now); yesterdayD.setDate(yesterdayD.getDate() - 1);
  const dayBeforeD = new Date(now); dayBeforeD.setDate(dayBeforeD.getDate() - 2);
  const yesterdayKey = dayKeyFor(yesterdayD);
  const dayBeforeYesterdayKey = dayKeyFor(dayBeforeD);

  const restoreEligible = restoreState !== "done" && isStreakRestoreEligible({
    lastStreakDay, todayKey, yesterdayKey, dayBeforeYesterdayKey,
  });

  const handleRestore = async () => {
    if (!uid || restoreState === "pending") return;
    setRestoreError(null);
    setRestoreState("pending");
    try {
      const res = await restoreStreak(uid, { todayKey, yesterdayKey, dayBeforeYesterdayKey, cost: STREAK_RESTORE_COST });
      if (res.ok) {
        setRestoreState("done");
      } else {
        setRestoreState("error");
        setRestoreError(res.reason === "not-enough-coins" ? "Not enough coins." : "Streak can no longer be restored.");
      }
    } catch (err) {
      console.warn("[streak] restore failed:", err);
      setRestoreState("error");
      setRestoreError("Something went wrong. Try again.");
    }
  };

  useEffect(() => {
    const a = setTimeout(() => setPhase("flare"), 1300);
    const b = setTimeout(() => setPhase("settled"), 1950);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
  const activeDays = Object.keys(streakDays || {}).filter((k) => k.startsWith(monthPrefix)).length;

  const shiftMonth = (delta) => {
    let m = viewMonth + delta, y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewMonth(m); setViewYear(y);
  };

  const handleClose = () => { if (phase === "settled") onClose(); };
  const isIntro = phase !== "settled";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: phase === "settled" ? "rgba(20,18,40,0.55)" : COL.bg }}
      onClick={handleClose}
    >
      {isIntro && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ pointerEvents: "none" }}>
          <div className={phase === "flare" ? "sm-flareout" : "sm-popin"}>
            <StreakFlameIcon ignited size={110} />
          </div>
          {phase === "ignite" && (
            <div className="absolute flex flex-col items-center sm-count-in" style={{ marginTop: 150 }}>
              <span style={{ color: "#fff", fontSize: 40, fontWeight: 800, textShadow: `0 0 22px ${COL.coral}99` }}>
                {streak}
              </span>
              <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", marginTop: 2 }}>
                day streak
              </span>
            </div>
          )}
        </div>
      )}

      {phase === "settled" && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm rounded-[28px] p-6 max-h-[90vh] overflow-y-auto sm-modal-in"
          style={{ background: COL.bg }}
        >
          <div className="flex items-center justify-between mb-6">
            <button onClick={handleClose} className="w-9 h-9 flex items-center justify-center rounded-full" style={neu(false, 999)}>
              <X size={16} color={COL.sub} />
            </button>
            <span className="font-display font-bold text-lg" style={{ color: COL.ink }}>Streak</span>
            <div className="w-9 h-9" />
          </div>

          <div className="flex justify-center mb-6">
            <div style={neu(false, 999)} className="flex items-center gap-2 px-5 py-2.5 sm-chip-glow">
              <Flame size={18} color={COL.coral} className="sm-flame-beat" />
              <span className="font-display font-bold text-xl" style={{ color: COL.ink }}>{streak}</span>
            </div>
          </div>

          <div style={neu(true, 22)} className="p-4 mb-4">
            <div className="flex items-center justify-between mb-4">
              <span className="font-display font-semibold text-sm" style={{ color: COL.ink }}>
                {MONTHS[viewMonth]} {viewYear}
              </span>
              <div className="flex gap-1">
                <button onClick={() => shiftMonth(-1)} className="w-7 h-7 flex items-center justify-center rounded-full" style={neu(false, 999)}>
                  <ChevronLeft size={14} color={COL.sub} />
                </button>
                <button onClick={() => shiftMonth(1)} className="w-7 h-7 flex items-center justify-center rounded-full" style={neu(false, 999)}>
                  <ChevronRight size={14} color={COL.sub} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {WEEKDAYS.map((w, i) => (
                <div key={i} className="text-center font-body text-[11px]" style={{ color: COL.sub }}>{w}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (!d) return <div key={i} />;
                const k = dayKey(viewYear, viewMonth, d);
                const active = !!(streakDays || {})[k];
                const isToday = k === todayKey;
                return (
                  <div
                    key={i}
                    className="aspect-square flex items-center justify-center rounded-lg font-body text-xs sm-cell-in"
                    style={{
                      animationDelay: `${i * 14}ms`,
                      color: active ? "#fff" : COL.ink,
                      background: active
                        ? `linear-gradient(135deg, ${COL.coral}, ${COL.gold})`
                        : "transparent",
                      border: isToday && !active ? `1px solid ${COL.coral}` : "1px solid transparent",
                      fontWeight: active ? 700 : 400,
                      boxShadow: active ? `0 3px 10px ${COL.coral}55` : "none",
                    }}
                  >
                    {d}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div style={neu(false, 18)} className="p-4">
              <CheckCircle2 size={18} color={COL.mint} className="mb-2" />
              <div className="font-display font-bold text-lg" style={{ color: COL.ink }}>{activeDays}</div>
              <div className="font-body text-xs" style={{ color: COL.sub }}>Active Days</div>
            </div>
            <div style={neu(false, 18)} className="p-4">
              <Flame size={18} color={COL.coral} className="mb-2" />
              <div className="font-display font-bold text-lg" style={{ color: COL.ink }}>{streak}</div>
              <div className="font-body text-xs" style={{ color: COL.sub }}>Current Streak</div>
            </div>
          </div>

          {restoreEligible && (
            <div style={neu(true, 18)} className="p-4 mt-4">
              <div className="flex items-center gap-2 mb-1">
                <RotateCcw size={16} color={COL.gold} />
                <span className="font-display font-semibold text-sm" style={{ color: COL.ink }}>You missed a day</span>
              </div>
              <p className="font-body text-xs mb-3" style={{ color: COL.sub }}>
                Restore yesterday to keep your {streak}-day streak alive.
              </p>
              <button
                onClick={handleRestore}
                disabled={restoreState === "pending"}
                className="w-full py-2.5 rounded-full font-display font-semibold text-sm"
                style={{
                  background: `linear-gradient(135deg, ${COL.coral}, ${COL.gold})`,
                  color: "#fff",
                  opacity: restoreState === "pending" ? 0.7 : 1,
                }}
              >
                {restoreState === "pending" ? "Restoring…" : `Restore Streak — ${STREAK_RESTORE_COST.toLocaleString()} coins`}
              </button>
              {restoreError && (
                <p className="font-body text-xs mt-2 text-center" style={{ color: COL.coral }}>{restoreError}</p>
              )}
            </div>
          )}

          {restoreState === "done" && (
            <div style={neu(false, 18)} className="p-4 mt-4 flex items-center gap-2">
              <CheckCircle2 size={16} color={COL.mint} />
              <span className="font-body text-xs" style={{ color: COL.ink }}>Streak restored! Log in tomorrow to keep it going.</span>
            </div>
          )}
        </div>
      )}

      <style>{`
        /* ---------------- flame (ignite intro) ---------------- */
        .sm-flame-wrapper { position: relative; display: flex; align-items: center; justify-content: center; }
        .sm-flame-glow {
          position: absolute; inset: -28%; border-radius: 50%;
          filter: blur(16px); pointer-events: none; background: transparent;
          transition: background 0.4s ease;
        }
        .sm-flame-glow--lit {
          background: radial-gradient(circle, ${COL.coral}70 0%, ${COL.gold}30 42%, transparent 74%);
          animation: smBreathe 1.3s ease-in-out infinite;
        }
        @keyframes smBreathe {
          0%, 100% { transform: scale(0.98); opacity: 0.8; }
          50% { transform: scale(1.1); opacity: 1; }
        }
        .sm-flame-svg { position: relative; }
        .sm-flame-sway { transform-origin: 100px 236px; animation: smSway 2.6s ease-in-out infinite; }
        @keyframes smSway {
          0%, 100% { transform: rotate(-1.5deg) scaleX(1); }
          25% { transform: rotate(1.2deg) scaleX(0.98); }
          50% { transform: rotate(-0.8deg) scaleX(1.02); }
          75% { transform: rotate(1.6deg) scaleX(0.99); }
        }
        .sm-spark {
          position: absolute; bottom: 52%; left: 50%; width: 3px; height: 3px;
          border-radius: 50%; background: #ffdb92; box-shadow: 0 0 5px 1px #ffb43c99;
          opacity: 0; z-index: 2;
        }
        .sm-spark-1 { margin-left: -8px; animation: smSpark 1.7s ease-in infinite 0.15s; }
        .sm-spark-2 { margin-left: 7px; animation: smSpark 2s ease-in infinite 0.55s; }
        .sm-spark-3 { margin-left: -1px; animation: smSpark 1.5s ease-in infinite 1s; }
        .sm-spark-4 { margin-left: 12px; animation: smSpark 2.3s ease-in infinite 0.3s; }
        @keyframes smSpark {
          0% { opacity: 0; transform: translateY(0) translateX(0) scale(0.6); }
          15% { opacity: 1; }
          100% { opacity: 0; transform: translateY(-80px) translateX(8px) scale(0.2); }
        }

        /* ---------------- choreography ---------------- */
        .sm-popin { animation: smPopIn 440ms cubic-bezier(0.34,1.56,0.64,1) both; }
        @keyframes smPopIn { 0% { transform: scale(0.35); opacity: 0; } 60% { transform: scale(1.06); opacity: 1; } 100% { transform: scale(1); } }
        .sm-count-in { animation: smCountIn 380ms ease 220ms both; }
        @keyframes smCountIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .sm-flareout { animation: smFlareOut 650ms cubic-bezier(0.6,0,0.85,0.35) forwards; }
        @keyframes smFlareOut { 0% { transform: scale(1); filter: blur(0); } 100% { transform: scale(14); filter: blur(5px); opacity: 0.35; } }
        .sm-modal-in { animation: smModalPop 400ms cubic-bezier(0.22,1,0.36,1) both; }
        @keyframes smModalPop { from { opacity: 0; transform: scale(0.93) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .sm-cell-in { animation: smCellPop 280ms ease backwards; }
        @keyframes smCellPop { from { opacity: 0; transform: scale(0.75); } to { opacity: 1; transform: scale(1); } }
        .sm-flame-beat { animation: smFlameBeat 1.5s ease-in-out infinite; }
        @keyframes smFlameBeat { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.12); } }
        .sm-chip-glow { animation: smChipBreathe 2.2s ease-in-out infinite; }
        @keyframes smChipBreathe {
          0%, 100% { box-shadow: 8px 8px 20px rgba(0,0,0,0.55), -8px -8px 18px rgba(255,255,255,0.035); }
          50% { box-shadow: 0 0 18px ${COL.coral}40, 8px 8px 20px rgba(0,0,0,0.55), -8px -8px 18px rgba(255,255,255,0.035); }
        }
      `}</style>
    </div>
  );
}
