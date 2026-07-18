// src/components/Dashboard.jsx
import React from "react";
import { Bell, Sparkles, LogOut } from "lucide-react";
import { COL, neu } from "../theme";
import { fmtHrs } from "../lib/time";
import { StatCard } from "./StopwatchCard";
import { TimerCard } from "./TimerCard";
import { SubjectTimerCard } from "./SubjectTimerCard";
import { AnalyticsContent } from "./Settings";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 0 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 16) return "Good afternoon";
  if (hour >= 16 && hour < 19) return "Good evening";
  return "Good night";
}

// Dashboard entry animation: purely CSS (no extra deps), driven by
// `animation: ... both` with an increasing delay per section, so on every
// mount (first login, or switching back to the Home tab) each block
// settles in in order instead of the whole screen just appearing at once.
// `both` means each block holds its "from" state (invisible/offset) until
// its own delay elapses, so nothing flashes early.
const DASHBOARD_ENTRY_STYLE = (
  <style>{`
    @keyframes dashEntryUp {
      from { opacity: 0; transform: translateY(14px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .dash-entry {
      animation: dashEntryUp 420ms cubic-bezier(0.22,1,0.36,1) both;
    }
  `}</style>
);

export default function Dashboard({
  user, bankedSeconds, tasks, notesCount = 0, goChat, onLogout, history, dayKey, unreadCount, onOpenNotifications, myLeaderboardRank,
  timerRemaining, timerDuration, timerRunning, timerFinished, onTimerSetDuration, onTimerStart, onTimerPause, onTimerReset,
  subjectTimer,
}) {
  const name = user.displayName || "Student";
  const greeting = getGreeting();

  return (
    <div className="flex flex-col gap-5">
      {DASHBOARD_ENTRY_STYLE}

      <div className="flex items-center justify-between dash-entry" style={{ animationDelay: "0ms" }}>
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

      <div className="flex gap-3 dash-entry" style={{ animationDelay: "70ms" }}>
        <StatCard label="Time today" value={fmtHrs(bankedSeconds)} sub="synced to cloud" accent={COL.violet} />
        <StatCard label="Notes" value={`${notesCount}`} sub={notesCount === 1 ? "note saved" : "notes saved"} accent={COL.mint} />
      </div>

      <div className="dash-entry" style={{ animationDelay: "140ms" }}>
        <TimerCard
          remaining={timerRemaining}
          durationSeconds={timerDuration}
          running={timerRunning}
          finished={timerFinished}
          todaySeconds={bankedSeconds}
          onSetDuration={onTimerSetDuration}
          onStart={onTimerStart}
          onPause={onTimerPause}
          onReset={onTimerReset}
        />
      </div>

      {subjectTimer && (
        <div className="dash-entry" style={{ animationDelay: "175ms" }}>
          <SubjectTimerCard
            plan={subjectTimer.plan}
            activeIndex={subjectTimer.activeIndex}
            activeSubject={subjectTimer.activeSubject}
            remaining={subjectTimer.remaining}
            running={subjectTimer.running}
            finished={subjectTimer.finished}
            chiming={subjectTimer.chiming}
            totalPlanSeconds={subjectTimer.totalPlanSeconds}
            elapsedPlanSeconds={subjectTimer.elapsedPlanSeconds}
            onSetPlan={subjectTimer.setSubjectPlan}
            onStart={subjectTimer.start}
            onPause={subjectTimer.pause}
            onReset={subjectTimer.reset}
            onClearPlan={subjectTimer.clearPlan}
          />
        </div>
      )}

      <button
        onClick={goChat}
        style={{ ...neu(false, 20), animationDelay: "210ms" }}
        className="p-4 flex items-center gap-3 active:scale-[0.98] transition text-left dash-entry"
      >
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(123,110,246,0.15)" }}>
          <Sparkles size={16} color={COL.violet} />
        </div>
        <div>
          <div className="font-display font-semibold text-sm" style={{ color: COL.ink }}>Ask AI</div>
          <div className="font-body text-xs" style={{ color: COL.sub }}>Chat with NoteGPT</div>
        </div>
      </button>

      {/* Weekly Analytics — shown directly on the home page */}
      <div className="flex flex-col gap-3 dash-entry" style={{ animationDelay: "280ms" }}>
        <div className="font-display font-bold text-sm px-0.5" style={{ color: COL.ink }}>Weekly Analytics</div>
        <AnalyticsContent history={history} dayKey={dayKey} todaySeconds={bankedSeconds} tasks={tasks} myLeaderboardRank={myLeaderboardRank} />
      </div>
    </div>
  );
}
