"use client";

import { useEffect, useRef, useState } from "react";

const formatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function formatParts(date: Date) {
  // formatter output looks like "4:07 pm" — split into time and meridiem
  const parts = formatter.formatToParts(date);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "--";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "--";
  const dayPeriod = parts.find((p) => p.type === "dayPeriod")?.value ?? "";
  return { hour, minute, dayPeriod };
}

export default function LiveClock() {
  const [display, setDisplay] = useState<{ hour: string; minute: string; dayPeriod: string } | null>(
    null
  );
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const tick = () => {
      const next = formatParts(new Date());
      const key = `${next.hour}:${next.minute}${next.dayPeriod}`;
      // The visible minute only changes once every ~60 ticks — skip the
      // state update (and re-render) on the seconds in between.
      if (key === lastKeyRef.current) return;
      lastKeyRef.current = key;
      setDisplay(next);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  const { hour, minute, dayPeriod } = display ?? { hour: "--", minute: "--", dayPeriod: "" };

  return (
    <div className="glass-chip flex flex-col rounded-panel px-3 py-2 leading-none">
      <span className="font-display text-sm tracking-wide text-amber-100 tabular-nums sm:text-base">
        {hour}
        <span className="blink">:</span>
        {minute} {dayPeriod}
      </span>
      <span className="mt-1 text-[10px] uppercase tracking-[0.18em] text-amber-100/60 sm:text-[11px]">
        IST
      </span>
    </div>
  );
}
