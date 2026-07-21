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

// Formats a Date as "21 Jul, 01:33:01 PM" — the live wall-clock shown under
// the user's name on the dashboard. Always reflects the DEVICE's real local
// time (whatever timezone the phone is set to), not app/session state.
const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export function fmtLiveClock(date) {
  const d = date instanceof Date ? date : new Date(date);
  const day = d.getDate();
  const month = MONTH_ABBR[d.getMonth()];
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  const hh = String(h).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${day} ${month}, ${hh}:${mm}:${ss} ${ampm}`;
}

export function fmtHrs(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) return `${s}s`; // show seconds directly instead of always rounding down to "0m"
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return (s / 3600).toFixed(1) + "h";
}

// Compact display for coin/XP counters: 1000 -> "1k", 12500 -> "12.5k",
// 1,000,000 -> "1M", 1,000,000,000 -> "1B", 1,000,000,000,000 -> "1T"
export function fmtCompact(n) {
  const num = Math.max(0, Math.floor(n));
  const units = [
    { value: 1e12, suffix: "T" },
    { value: 1e9, suffix: "B" },
    { value: 1e6, suffix: "M" },
    { value: 1e3, suffix: "k" },
  ];
  for (const { value, suffix } of units) {
    if (num >= value) {
      const scaled = num / value;
      return `${scaled % 1 === 0 ? scaled.toFixed(0) : scaled.toFixed(1)}${suffix}`;
    }
  }
  return `${num}`;
}

// The Monday (local time, 00:00) that starts the calendar week containing
// `date`. Sunday counts as the last day of that week (not the first) — so
// weeks run Mon -> Sun, matching how the app's "week" resets.
export function getWeekStartKey(date = new Date()) {
  const d = new Date(date);
  const dow = d.getDay(); // 0 = Sun, 1 = Mon, ... 6 = Sat
  const diffToMonday = dow === 0 ? 6 : dow - 1; // days since this week's Monday
  d.setDate(d.getDate() - diffToMonday);
  return dayKeyFor(d);
}

// The 1st of the calendar month containing `date`.
export function getMonthStartKey(date = new Date()) {
  const d = new Date(date);
  d.setDate(1);
  return dayKeyFor(d);
}

// True if `dayKey` (YYYY-MM-DD) falls within the Mon-Sun week that contains
// `date` (defaults to today).
export function isInCurrentWeek(dayKey, date = new Date()) {
  return dayKey >= getWeekStartKey(date) && dayKey <= dayKeyFor(date);
}

// True if `dayKey` falls within the same calendar month as `date`.
export function isInCurrentMonth(dayKey, date = new Date()) {
  return dayKey >= getMonthStartKey(date) && dayKey <= dayKeyFor(date);
}

// milliseconds until the next Monday 00:00 (local time) — used to know when
// weekly resets (leaderboard, weekly analytics, week graph) should roll over.
export function msUntilNextWeekReset(now = new Date()) {
  const d = new Date(now);
  const dow = d.getDay();
  const daysUntilMonday = dow === 0 ? 1 : 8 - dow; // days from `now` to next Monday
  d.setDate(d.getDate() + daysUntilMonday);
  d.setHours(0, 0, 0, 0);
  return d.getTime() - now.getTime();
}


export function msUntilNextReset(now = new Date()) {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0); // rolls over to next day's 00:00:00
  return next.getTime() - now.getTime();
}
