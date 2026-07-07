// src/components/Dashboard.jsx
import React from "react";
import { Bell, Sparkles, LogOut } from "lucide-react";
import { COL, neu } from "../theme";
import { fmtHrs } from "../lib/time";
import { StopwatchCard, StatCard } from "./StopwatchCard";

export default function Dashboard({ user, bankedSeconds, displaySeconds, running, onToggle, onReset, tasks, goChat, onLogout }) {
  const doneCount = tasks.filter((t) => t.done).length;
  const name = user.displayName || "Student";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {user.photoURL ? (
            <img src={user.photoURL} alt={name} className="w-11 h-11 rounded-2xl object-cover" />
          ) : (
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center font-display font-bold text-white"
              style={{ background: `linear-gradient(135deg, ${COL.blue}, ${COL.violet})` }}>{name[0]}</div>
          )}
          <div>
            <div className="font-body text-xs" style={{ color: COL.sub }}>Good morning</div>
            <div className="font-display font-semibold text-base" style={{ color: COL.ink }}>{name}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button style={neu(false, 999)} className="w-10 h-10 flex items-center justify-center"><Bell size={16} color={COL.sub} /></button>
          <button onClick={onLogout} style={neu(false, 999)} className="w-10 h-10 flex items-center justify-center"><LogOut size={15} color={COL.sub} /></button>
        </div>
      </div>

      <div className="flex gap-3">
        <StatCard label="Time today" value={fmtHrs(bankedSeconds)} sub="synced to cloud" accent={COL.violet} />
        <StatCard label="Tasks done" value={`${doneCount}/${tasks.length}`} sub="on track" accent={COL.mint} />
      </div>

      <StopwatchCard seconds={displaySeconds} running={running} onToggle={onToggle} onReset={onReset} />

      <button onClick={goChat} style={neu(false, 20)} className="p-4 flex items-center gap-3 active:scale-[0.98] transition text-left">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(123,110,246,0.15)" }}>
          <Sparkles size={16} color={COL.violet} />
        </div>
        <div>
          <div className="font-display font-semibold text-sm" style={{ color: COL.ink }}>Ask AI</div>
          <div className="font-body text-xs" style={{ color: COL.sub }}>Gemini for notes, Google for search</div>
        </div>
      </button>
    </div>
  );
}
