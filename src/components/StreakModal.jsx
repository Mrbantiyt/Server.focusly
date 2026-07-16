// src/components/StreakModal.jsx
import React, { useEffect, useState } from "react";
import { X, Flame, ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { COL, neu } from "../theme";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function dayKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Flame — built from a handful of stacked, independently-flickering blobs.
// Each layer gets its own easing/speed so the silhouette never repeats.
// ---------------------------------------------------------------------------
function StreakFlame({ size = 96 }) {
  return (
    <div className="ember" style={{ width: size, height: size * 1.25 }}>
      <div className="ember-halo" />
      <div className="ember-layer ember-base" />
      <div className="ember-layer ember-belly" />
      <div className="ember-layer ember-crown" />
      <div className="ember-layer ember-tip" />
      <div className="ember-wisp ember-wisp-l" />
      <div className="ember-wisp ember-wisp-r" />
      <i className="ember-spark s1" />
      <i className="ember-spark s2" />
      <i className="ember-spark s3" />
    </div>
  );
}

export default function StreakModal({ streak, streakDays, onClose }) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [phase, setPhase] = useState("ignite"); // ignite -> flare -> settled

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
  const todayKey = dayKey(now.getFullYear(), now.getMonth(), now.getDate());
  const isIntro = phase !== "settled";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: phase === "settled" ? "rgba(20,18,40,0.55)" : COL.bg }}
      onClick={handleClose}
    >
      {isIntro && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ pointerEvents: "none" }}>
          <div className={phase === "flare" ? "ember-flareout" : "ember-popin"}>
            <StreakFlame size={110} />
          </div>
          {phase === "ignite" && (
            <div className="absolute flex flex-col items-center ember-count-in" style={{ marginTop: 150 }}>
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
          className="w-full max-w-sm rounded-[28px] p-6 max-h-[90vh] overflow-y-auto ember-modal-in"
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
            <div style={neu(false, 999)} className="flex items-center gap-2 px-5 py-2.5 ember-chip-glow">
              <Flame size={18} color={COL.coral} className="ember-flame-beat" />
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
                    className="aspect-square flex items-center justify-center rounded-lg font-body text-xs ember-cell-in"
                    style={{
                      animationDelay: `${i * 14}ms`,
                      color: active ? "#fff" : COL.ink,
                      background: active ? COL.coral : "transparent",
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
        </div>
      )}

      <style>{`
        /* ---------------- flame ---------------- */
        .ember { position: relative; }
        .ember-halo {
          position: absolute; inset: -28%; border-radius: 50%;
          background: radial-gradient(circle, ${COL.coral}70 0%, ${COL.gold}30 42%, transparent 74%);
          filter: blur(16px);
          animation: emberBreathe 1.3s ease-in-out infinite;
        }
        @keyframes emberBreathe {
          0%, 100% { transform: scale(0.98); opacity: 0.8; }
          50% { transform: scale(1.1); opacity: 1; }
        }
        .ember-layer {
          position: absolute; bottom: 0; left: 50%;
          border-radius: 48% 52% 46% 54% / 58% 62% 38% 42%;
          transform-origin: bottom center;
        }
        .ember-base {
          width: 82%; height: 90%; margin-left: -41%;
          background: linear-gradient(to top, #e6350f 0%, #ff6a2e 48%, #ff9a3d 100%);
          filter: blur(1px);
          animation: emberSwayA 1.4s ease-in-out infinite;
        }
        .ember-belly {
          width: 58%; height: 74%; margin-left: -29%;
          background: linear-gradient(to top, #ff5a1f 0%, #ff8c30 52%, #ffc25a 100%);
          animation: emberSwayB 1.1s ease-in-out infinite;
        }
        .ember-crown {
          width: 38%; height: 58%; margin-left: -19%;
          background: linear-gradient(to top, #ff8a1f 0%, #ffb238 55%, #ffe08a 100%);
          animation: emberSwayC 0.9s ease-in-out infinite;
        }
        .ember-tip {
          width: 20%; height: 40%; margin-left: -10%;
          background: linear-gradient(to top, #ffd23d 0%, #fff2b0 60%, #ffffff 100%);
          animation: emberSwayD 0.7s ease-in-out infinite;
        }
        @keyframes emberSwayA {
          0%, 100% { transform: scaleX(1) skewX(0deg); }
          50% { transform: scaleX(0.93) skewX(2.5deg) translateX(2px); }
        }
        @keyframes emberSwayB {
          0%, 100% { transform: scaleX(1) translateY(0); }
          50% { transform: scaleX(1.07) translateY(-2px) skewX(-2deg); }
        }
        @keyframes emberSwayC {
          0%, 100% { transform: scaleY(1) translateX(0); }
          50% { transform: scaleY(1.12) translateX(-2px); }
        }
        @keyframes emberSwayD {
          0%, 100% { transform: scaleY(1) translateY(0); opacity: 1; }
          50% { transform: scaleY(1.16) translateY(-3px); opacity: 0.9; }
        }
        .ember-wisp {
          position: absolute; bottom: 5%; width: 20%; height: 36%;
          border-radius: 50%; background: linear-gradient(to top, #ff5a1f, #ffab45);
          opacity: 0.8;
        }
        .ember-wisp-l { left: 12%; animation: wispL 1.6s ease-in-out infinite; }
        .ember-wisp-r { right: 12%; animation: wispR 1.4s ease-in-out infinite; }
        @keyframes wispL { 0%, 100% { transform: rotate(-6deg); } 50% { transform: rotate(-15deg) scaleY(1.1); } }
        @keyframes wispR { 0%, 100% { transform: rotate(6deg); } 50% { transform: rotate(15deg) scaleY(1.08); } }
        .ember-spark {
          position: absolute; bottom: 52%; left: 50%; width: 3px; height: 3px;
          border-radius: 50%; background: #ffdb92; box-shadow: 0 0 5px 1px #ffb43c99;
          opacity: 0;
        }
        .s1 { margin-left: -8px; animation: emberSpark 1.7s ease-in infinite 0.15s; }
        .s2 { margin-left: 7px; animation: emberSpark 2s ease-in infinite 0.55s; }
        .s3 { margin-left: -1px; animation: emberSpark 1.5s ease-in infinite 1s; }
        @keyframes emberSpark {
          0% { opacity: 0; transform: translateY(0) scale(0.6); }
          15% { opacity: 1; }
          100% { opacity: 0; transform: translateY(-80px) translateX(8px) scale(0.2); }
        }

        /* ---------------- choreography ---------------- */
        .ember-popin { animation: popIn 440ms cubic-bezier(0.34,1.56,0.64,1) both; }
        @keyframes popIn { 0% { transform: scale(0.35); opacity: 0; } 60% { transform: scale(1.06); opacity: 1; } 100% { transform: scale(1); } }
        .ember-count-in { animation: countIn 380ms ease 220ms both; }
        @keyframes countIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .ember-flareout { animation: flareOut 650ms cubic-bezier(0.6,0,0.85,0.35) forwards; }
        @keyframes flareOut { 0% { transform: scale(1); filter: blur(0); } 100% { transform: scale(14); filter: blur(5px); opacity: 0.35; } }
        .ember-modal-in { animation: modalPop 400ms cubic-bezier(0.22,1,0.36,1) both; }
        @keyframes modalPop { from { opacity: 0; transform: scale(0.93) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .ember-cell-in { animation: cellPop 280ms ease backwards; }
        @keyframes cellPop { from { opacity: 0; transform: scale(0.75); } to { opacity: 1; transform: scale(1); } }
        .ember-flame-beat { animation: flameBeat 1.5s ease-in-out infinite; }
        @keyframes flameBeat { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.12); } }
        .ember-chip-glow { animation: chipBreathe 2.2s ease-in-out infinite; }
        @keyframes chipBreathe {
          0%, 100% { box-shadow: 8px 8px 20px rgba(0,0,0,0.55), -8px -8px 18px rgba(255,255,255,0.035); }
          50% { box-shadow: 0 0 18px ${COL.coral}40, 8px 8px 20px rgba(0,0,0,0.55), -8px -8px 18px rgba(255,255,255,0.035); }
        }
      `}</style>
    </div>
  );
}
