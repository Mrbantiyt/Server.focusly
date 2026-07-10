// src/components/Dashboard.jsx
import React from "react";
import { Bell, Sparkles, LogOut } from "lucide-react";
import { COL, neu } from "../theme";
import { fmtHrs } from "../lib/time";
import { StopwatchCard, StatCard } from "./StopwatchCard";
import { AnalyticsContent } from "./Settings";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 0 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 16) return "Good afternoon";
  if (hour >= 16 && hour < 19) return "Good evening";
  return "Good night";
}

export default function Dashboard({ user, bankedSeconds, displaySeconds, running, onToggle, onReset, tasks, goChat, onLogout, history, dayKey, unreadCount, onOpenNotifications }) {
  const doneCount = tasks.filter((t) => t.done).length;
  const name = user.displayName || "Student";
  const greeting = getGreeting();

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
            <div className="font-body text-xs" style={{ color: COL.sub }}>{greeting}</div>
            <div className="font-display font-semibold text-base" style={{ color: COL.ink }}>{name}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onOpenNotifications} style={neu(false, 999)} className="relative w-10 h-10 flex items-center justify-center">
            <Bell size={16} color={COL.sub} />
            {unreadCount > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                style={{ background: COL.coral }}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
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
          <div className="font-body text-xs" style={{ color: COL.sub }}>Chat, or attach a photo of your notes</div>
        </div>
      </button>

      {/* Weekly Analytics — shown directly on the home page */}
      <div className="flex flex-col gap-3">
        <div className="font-display font-bold text-sm px-0.5" style={{ color: COL.ink }}>Weekly Analytics</div>
        <AnalyticsContent history={history} dayKey={dayKey} todaySeconds={bankedSeconds} tasks={tasks} />
      </div>
    </div>
  );
}
