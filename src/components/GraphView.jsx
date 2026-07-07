// src/components/GraphView.jsx
import React, { useState } from "react";
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell, Tooltip } from "recharts";
import { COL, neu } from "../theme";
import { dayKeyFor } from "../lib/time";

export default function GraphView({ history, todayKey, todaySeconds }) {
  const [range, setRange] = useState("week");
  const days = range === "week" ? 7 : 30;
  const data = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = dayKeyFor(d);
    const secs = key === todayKey ? todaySeconds : (history[key] || 0);
    data.push({ label: range === "week" ? "SMTWTFS"[d.getDay()] : d.getDate(), hrs: +(secs / 3600).toFixed(2) });
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
              {r === "week" ? "7 days" : "1 month"}
            </button>
          ))}
        </div>
      </div>
      <div style={neu(false, 24)} className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="font-body text-xs" style={{ color: COL.sub }}>{range === "week" ? "Last 7 days" : "Last 30 days"}</span>
          <span className="font-display font-semibold text-sm" style={{ color: COL.ink }}>{total}h total</span>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} barCategoryGap={range === "week" ? "30%" : "15%"}>
            <XAxis dataKey="label" axisLine={false} tickLine={false} interval={range === "week" ? 0 : 4}
              tick={{ fill: COL.sub, fontSize: 10, fontFamily: "Inter" }} />
            <Tooltip cursor={false} contentStyle={{ borderRadius: 12, border: "none", fontSize: 12 }} formatter={(v) => [`${v}h`, "studied"]} />
            <Bar dataKey="hrs" radius={[6, 6, 6, 6]}>
              {data.map((d, i) => <Cell key={i} fill={i === data.length - 1 ? COL.violet : "#DADEF0"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
