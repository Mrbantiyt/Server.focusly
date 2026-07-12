// src/components/StreakModal.jsx
import React, { useState } from "react";
import { X, Flame, ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { COL, neu } from "../theme";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function keyFor(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export default function StreakModal({ streak, streakDays, onClose }) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0-indexed

  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const activeDays = Object.keys(streakDays || {}).filter((k) => k.startsWith(`${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`)).length;

  const shiftMonth = (delta) => {
    let m = viewMonth + delta, y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewMonth(m); setViewYear(y);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,18,40,0.55)" }}>
      <div className="w-full max-w-sm rounded-[28px] p-6 max-h-[90vh] overflow-y-auto" style={{ background: COL.bg }}>
        <div className="flex items-center justify-between mb-6">
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full" style={neu(false, 999)}>
            <X size={16} color={COL.sub} />
          </button>
          <span className="font-display font-bold text-lg" style={{ color: COL.ink }}>Streak</span>
          <div className="w-9 h-9" />
        </div>

        <div className="flex justify-center mb-6">
          <div style={neu(false, 999)} className="flex items-center gap-2 px-5 py-2.5">
            <Flame size={18} color={COL.coral} />
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
              const active = !!(streakDays || {})[keyFor(viewYear, viewMonth, d)];
              return (
                <div key={i} className="aspect-square flex items-center justify-center rounded-lg font-body text-xs"
                  style={{
                    color: active ? "#fff" : COL.ink,
                    background: active ? COL.coral : "transparent",
                    fontWeight: active ? 700 : 400,
                  }}>
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
    </div>
  );
}
