// src/components/GraphView.jsx
import React, { useState } from "react";
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell, Tooltip } from "recharts";
import { COL, neu } from "../theme";
import { dayKeyFor, getWeekStartKey, getMonthStartKey } from "../lib/time";

export default function GraphView({ history, todayKey, todaySeconds }) {
  const [range, setRange] = useState("week");
  const today = new Date();

  // "week" = the fixed Mon -> Sun calendar week containing today (resets
  // every Monday). "month" = the fixed calendar month containing today,
  // from the 1st through today (resets on the 1st of each month).
  let start;
  if (range === "week") {
    start = new Date(getWeekStartKey(today) + "T00:00:00");
  } else {
    start = new Date(getMonthStartKey(today) + "T00:00:00");
  }
  const daysElapsed = Math.floor((today - start) / 86400000) + 1;

  const data = [];
  for (let i = daysElapsed - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const key = dayKeyFor(d);
    const secs = key === todayKey ? todaySeconds : (history[key] || 0);
    data.push({ label: range === "week" ? "MTWTFSS"[d.getDay() === 0 ? 6 : d.getDay() - 1] : d.getDate(), hrs: +(secs / 3600).toFixed(2) });
  }
  const total = data.reduce((a, b) => a + b.hrs, 0).toFixed(1);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="font-display font-semibold text-lg" style={{ color: COL.ink }}>Progress</span>
        <div style={neu(true, 999)} className="flex p-1 gap-1">
          {["week", "month"].map((r) => (
            <button key={r} onClick={() => setRange(r)} className="px-3 py-1.5 rounded-full font-body text-xs"
              style={{ background: range === r ? COL.violet : "transparent", color: range === r ? "#fff" : COL.sub }}>
              {r === "week" ? "This week" : "This month"}
            </button>
          ))}
        </div>
      </div>
      <div style={neu(false, 24)} className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="font-body text-xs" style={{ color: COL.sub }}>
            {range === "week" ? "Mon – today (resets Monday)" : "1st – today (resets monthly)"}
          </span>
          <span className="font-display font-semibold text-sm" style={{ color: COL.ink }}>{total}h total</span>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} barCategoryGap={range === "week" ? "30%" : "15%"}>
            <XAxis dataKey="label" axisLine={false} tickLine={false} interval={range === "week" ? 0 : 4}
              tick={{ fill: COL.sub, fontSize: 10, fontFamily: "Inter" }} />
            <Tooltip cursor={false} contentStyle={{ borderRadius: 12, border: "none", fontSize: 12 }} formatter={(v) => [`${v}h`, "studied"]} />
            <Bar dataKey="hrs" radius={[6, 6, 6, 6]}>
              {data.map((d, i) => {
                const isToday = i === data.length - 1;
                const color = isToday ? COL.violet : (d.hrs > 0 ? COL.ink : COL.track);
                return <Cell key={i} fill={color} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
