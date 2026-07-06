// src/App.jsx
import React, { useEffect, useState } from "react";
import { Home, MessageSquare, CheckSquare, CalendarDays, Settings as SettingsIcon } from "lucide-react";
import { COL, neu } from "./theme";
import { useAuth } from "./hooks/useAuth";
import { useStopwatch } from "./hooks/useStopwatch";
import { useStudyHistory } from "./hooks/useStudyHistory";
import { watchTasks } from "./lib/firestore";

import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import Chat from "./components/Chat";
import Tasks from "./components/Tasks";
import CalendarView from "./components/CalendarView";
import GraphView from "./components/GraphView";
import Settings from "./components/Settings";

const FONT = (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap');
    .font-display{font-family:'Sora',sans-serif} .font-body{font-family:'Inter',sans-serif}
  `}</style>
);

const NAV = [
  { id: "home", icon: Home },
  { id: "chat", icon: MessageSquare },
  { id: "tasks", icon: CheckSquare },
  { id: "cal", icon: CalendarDays },
  { id: "settings", icon: SettingsIcon },
];

export default function App() {
  const { user, loading, loginWithGoogle, logout } = useAuth();
  const [tab, setTab] = useState("home");
  const { seconds, todaySeconds, running, toggle, reset, dayKey } = useStopwatch(user?.uid);
  const history = useStudyHistory(user?.uid, 31);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    if (!user) return;
    return watchTasks(user.uid, setTasks);
  }, [user]);

  return (
    <div className="w-full min-h-screen flex items-center justify-center p-4" style={{ background: COL.bg }}>
      {FONT}
      <div className="w-full max-w-sm rounded-[36px] overflow-hidden flex flex-col"
        style={{ height: 780, background: COL.bg, boxShadow: "0 30px 60px rgba(90,95,140,0.25)" }}>

        {loading ? (
          <div className="flex-1 flex items-center justify-center font-body text-sm" style={{ color: COL.sub }}>Loading…</div>
        ) : !user ? (
          <Login onLogin={loginWithGoogle} />
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 pt-6 pb-3">
              {tab === "home" && (
                <Dashboard user={user} bankedSeconds={todaySeconds} displaySeconds={seconds} running={running} onToggle={toggle} onReset={reset}
                  tasks={tasks} goChat={() => setTab("chat")} onLogout={logout} />
              )}
              {tab === "chat" && <Chat />}
              {tab === "tasks" && <Tasks uid={user.uid} />}
              {tab === "cal" && (
                <div className="flex flex-col gap-6">
                  <CalendarView history={history} todayKey={dayKey} todaySeconds={todaySeconds} />
                  <GraphView history={history} todayKey={dayKey} todaySeconds={todaySeconds} />
                </div>
              )}
              {tab === "settings" && (
                <Settings
                  user={user}
                  tasks={tasks}
                  totalStudySeconds={
                    Object.entries(history).reduce((sum, [k, v]) => sum + (k === dayKey ? 0 : v), 0) + todaySeconds
                  }
                  onLogout={logout}
                />
              )}
            </div>

            <div className="px-5 pb-5 pt-2">
              <div style={neu(false, 24)} className="flex items-center justify-between px-4 py-3">
                {NAV.map((n) => {
                  const Icon = n.icon, active = tab === n.id;
                  return (
                    <button key={n.id} onClick={() => setTab(n.id)} className="flex flex-col items-center gap-1">
                      <Icon size={18} color={active ? COL.violet : COL.sub} />
                      <div className="w-1 h-1 rounded-full" style={{ background: active ? COL.violet : "transparent" }} />
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
