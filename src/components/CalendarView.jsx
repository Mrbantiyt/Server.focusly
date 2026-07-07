// src/components/CalendarView.jsx
import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { COL } from "../theme";
import { dayKeyFor, fmtHrs } from "../lib/time";

export default function CalendarView({ history, todayKey, todaySeconds }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const base = new Date();
  base.setMonth(base.getMonth() + monthOffset);
  const year = base.getFullYear(), month = base.getMonth();
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(startPad).fill(null), ...Array(daysInMonth).keys()].map((d) => (d === null ? null : d + 1));
  const monthLabel = base.toLocaleString("default", { month: "long", year: "numeric" });

  const secondsFor = (day) => {
    const key = dayKeyFor(new Date(year, month, day, 12));
    return key === todayKey ? todaySeconds : (history[key] || 0);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setMonthOffset((m) => m - 1)}><ChevronLeft size={18} color={COL.sub} /></button>
        <span className="font-display font-semibold text-base" style={{ color: COL.ink }}>{monthLabel}</span>
        <button onClick={() => setMonthOffset((m) => m + 1)}><ChevronRight size={18} color={COL.sub} /></button>
      </div>
      <div className="grid grid-cols-7 gap-y-2 text-center">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="font-body text-[10px]" style={{ color: COL.sub }}>{d}</span>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const secs = secondsFor(day);
          const isToday = dayKeyFor(new Date(year, month, day, 12)) === todayKey;
          return (
            <div key={i} className="flex flex-col items-center gap-0.5">
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-body text-xs"
                style={{ background: isToday ? COL.ink : "transparent", color: isToday ? "#fff" : COL.ink }}>{day}</div>
              <span className="font-body text-[9px]" style={{ color: secs > 0 ? COL.violet : "transparent" }}>
                {secs > 0 ? fmtHrs(secs) : "•"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
