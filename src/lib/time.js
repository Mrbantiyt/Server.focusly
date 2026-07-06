// src/lib/time.js

// "Study day" runs 4:00 AM -> 3:59 AM, so anything before 4am still counts
// toward the previous calendar day. This is what makes the stopwatch
// auto-reset to 0 right after 4am.
export function dayKeyFor(date) {
  const d = new Date(date);
  if (d.getHours() < 4) d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
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
  if (s < 3600) return `${Math.floor(s / 60)}m`; // avoids showing "0.0h" for short sessions
  return (s / 3600).toFixed(1) + "h";
}

// Compact display for coin/XP counters: 1000 -> "1k", 12500 -> "12.5k"
export function fmtCompact(n) {
  const num = Math.max(0, Math.floor(n));
  if (num < 1000) return `${num}`;
  const k = num / 1000;
  return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
}

// milliseconds until the next 4:00 AM boundary from "now"
export function msUntilNextReset(now = new Date()) {
  const next = new Date(now);
  next.setHours(4, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}
