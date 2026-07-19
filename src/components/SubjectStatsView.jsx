// src/components/SubjectStatsView.jsx
//
// The richer "Stats" block shown under the Calendar tab, added alongside
// (not replacing) the existing CalendarView + GraphView. Three cards, all
// driven by real data already flowing through the app:
//
//   1. Total Study Time  — 7-day (Mon-Sun) trend, from `history` + today.
//   2. Time by Subject   — donut built from `subjectHistory`, a day-keyed
//      per-subject map (see lib/firestore.js: addSubjectSecondsForDay /
//      watchSubjectHistory) written by the Custom Timer. Shows ONLY today's
//      entry (subjectHistory[todayKey]) and resets at local midnight, same
//      as "Total Study Time"'s daily bucket — it intentionally does NOT sum
//      the whole Mon-Sun week like card 1 does, so it can be lower than
//      "Total Study Time" (which is a weekly figure) even on a single day.
//   3. Focus Rate        — how close each of the last 7 days got to a daily
//      study-time goal (DAILY_GOAL_HOURS below). There's no per-session
//      "were you actually focused" signal in this app yet, so this is
//      explicitly a goal-completion rate, not a distraction/attention
//      metric — labelled accordingly.
import React, { useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import { COL, neu } from "../theme";
import { dayKeyFor, getWeekStartKey } from "../lib/time";

// A day's studied hours count as "goal met" (100%) once they reach this —
// tune freely; not exposed as a user setting yet.
const DAILY_GOAL_HOURS = 4;

const SUBJECT_PALETTE = [COL.violet, COL.blue, COL.mint, COL.gold, COL.coral, "#8f8fa8", "#4fd1e8", "#e07bf6"];

function fmtHM(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export default function SubjectStatsView({ history, todayKey, todaySeconds, subjectHistory }) {
  const today = new Date();
  const weekStartKey = getWeekStartKey(today);

  // Last 7 calendar days Mon->Sun containing today, each { label, secs }.
  const weekDays = useMemo(() => {
    const start = new Date(weekStartKey + "T00:00:00");
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const key = dayKeyFor(d);
      const secs = key === todayKey ? todaySeconds : (history[key] || 0);
      out.push({ key, label: "MTWTFSS"[i], secs: key > todayKey ? 0 : secs });
    }
    return out;
  }, [history, todayKey, todaySeconds, weekStartKey]);

  const weekTotalSeconds = weekDays.reduce((sum, d) => sum + d.secs, 0);

  // Changed from a Mon-Sun weekly sum to TODAY-ONLY, so this card resets at
  // local midnight just like "Total Study Time"/todaySeconds do, instead of
  // waiting for the next Monday. Only `subjectHistory[todayKey]` is read now.
  const bySubject = useMemo(() => {
    const totals = {};
    const dayMap = (subjectHistory || {})[todayKey];
    if (dayMap) {
      Object.entries(dayMap).forEach(([name, secs]) => {
        if (typeof secs === "number" && secs > 0) totals[name] = (totals[name] || 0) + secs;
      });
    }
    const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    return entries.map(([name, secs], i) => ({ name, secs, color: SUBJECT_PALETTE[i % SUBJECT_PALETTE.length] }));
  }, [subjectHistory, todayKey]);
  const subjectTotalSeconds = bySubject.reduce((sum, e) => sum + e.secs, 0);

  const focusRateToday = Math.min(100, Math.round((todaySeconds / 3600 / DAILY_GOAL_HOURS) * 100));

  return (
    <div className="flex flex-col gap-4">
      <span className="font-display font-semibold text-lg" style={{ color: COL.ink }}>Stats</span>

      {/* Total Study Time */}
      <div style={neu(false, 24)} className="p-5">
        <span className="font-body text-xs" style={{ color: COL.sub }}>Total Study Time (this week)</span>
        <div className="font-display font-bold text-2xl mt-1" style={{ color: COL.ink }}>{fmtHM(weekTotalSeconds)}</div>
        <div style={{ width: "100%", height: 110 }} className="mt-2">
          <ResponsiveContainer>
            <AreaChart data={weekDays.map((d) => ({ day: d.label, hrs: +(d.secs / 3600).toFixed(2) }))}>
              <defs>
                <linearGradient id="statsAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COL.violet} stopOpacity={0.55} />
                  <stop offset="100%" stopColor={COL.violet} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fill: COL.sub, fontSize: 10, fontFamily: "Inter" }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip cursor={false} contentStyle={{ background: COL.card, border: "none", borderRadius: 12, fontSize: 12 }}
                labelStyle={{ color: COL.ink }} formatter={(v) => [`${v}h`, "studied"]} />
              <Area type="monotone" dataKey="hrs" stroke={COL.violet} strokeWidth={2} fill="url(#statsAreaGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Time by Subject */}
      <div style={neu(false, 24)} className="p-5">
        <span className="font-display font-semibold text-sm" style={{ color: COL.ink }}>Time by Subject (today)</span>
        {bySubject.length === 0 ? (
          <div className="mt-3 text-center py-4">
            <p className="font-body text-xs" style={{ color: COL.sub }}>
              No subject data yet today — use the Custom (multi-subject) Timer on Home to start tracking time per subject.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-4 mt-3">
            <div style={{ width: 120, height: 120 }} className="relative shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={bySubject} dataKey="secs" nameKey="name" innerRadius={38} outerRadius={58} paddingAngle={3} stroke="none">
                    {bySubject.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display font-bold text-xs" style={{ color: COL.ink }}>{fmtHM(subjectTotalSeconds)}</span>
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-1.5 min-w-0">
              {bySubject.slice(0, 6).map((e, i) => (
                <div key={i} className="flex items-center justify-between text-xs gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="h-2 w-2 rounded-full shrink-0" style={{ background: e.color }} />
                    <span className="font-body truncate" style={{ color: COL.ink, opacity: 0.85 }}>{e.name}</span>
                  </div>
                  <span className="font-body shrink-0" style={{ color: COL.sub }}>{fmtHM(e.secs)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {bySubject.length > 0 && (
          <p className="font-body text-[10px] mt-2" style={{ color: COL.sub }}>
            Only counts time from the Custom (multi-subject) Timer — plain Study Timer sessions aren't tagged to a subject, so this total can be lower than "Total Study Time" above.
          </p>
        )}
      </div>

      {/* Focus Rate (goal completion) */}
      <div style={neu(false, 24)} className="p-5">
        <div className="flex items-center justify-between mb-1">
          <span className="font-display font-semibold text-sm" style={{ color: COL.ink }}>Focus Rate</span>
          <span className="font-display font-bold text-lg" style={{ color: COL.ink }}>{focusRateToday}%</span>
        </div>
        <span className="font-body text-[10px]" style={{ color: COL.sub }}>% of your {DAILY_GOAL_HOURS}h daily goal reached, per day</span>
        <div style={{ width: "100%", height: 90 }} className="mt-2">
          <ResponsiveContainer>
            <BarChart data={weekDays.map((d) => ({
              day: d.label,
              pct: Math.min(100, Math.round((d.secs / 3600 / DAILY_GOAL_HOURS) * 100)),
              isToday: d.key === todayKey,
            }))}>
              <XAxis dataKey="day" tick={{ fill: COL.sub, fontSize: 10, fontFamily: "Inter" }} axisLine={false} tickLine={false} />
              <YAxis hide domain={[0, 100]} />
              <Tooltip cursor={false} contentStyle={{ background: COL.card, border: "none", borderRadius: 12, fontSize: 12 }}
                labelStyle={{ color: COL.ink }} formatter={(v) => [`${v}%`, "of goal"]} />
              <Bar dataKey="pct" radius={[6, 6, 6, 6]}>
                {weekDays.map((d, i) => (
                  <Cell key={i} fill={d.key === todayKey ? COL.mint : "rgba(63,207,163,0.35)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
