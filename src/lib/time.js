// src/lib/time.js

// Calendar day, midnight -> midnight (local time). Whatever the local clock
// says today is what counts as "today" - no 4am shift.
export function dayKeyFor(date) {
  const d = new Date(date);
  // Build the key from LOCAL date parts. toISOString() would convert to UTC
  // first, which shifts the date for any timezone ahead of UTC (e.g. IST,
  // UTC+5:30) and makes the rollover fire at the wrong local time/day.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`; // "YYYY-MM-DD"
}

export function fmtHMS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

export function fmtHrs(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) return `${s}s`; // show seconds directly instead of always rounding down to "0m"
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return (s / 3600).toFixed(1) + "h";
}

// Compact display for coin/XP counters: 1000 -> "1k", 12500 -> "12.5k"
export function fmtCompact(n) {
  const num = Math.max(0, Math.floor(n));
  if (num < 1000) return `${num}`;
  const k = num / 1000;
  return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
}

// milliseconds until the next midnight boundary from "now"
export function msUntilNextReset(now = new Date()) {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0); // rolls over to next day's 00:00:00
  return next.getTime() - now.getTime();
}
