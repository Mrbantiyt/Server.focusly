// src/App.jsx
import React, { useEffect, useState } from "react";
import { Home, MessageSquare, CheckSquare, CalendarDays, Settings as SettingsIcon } from "lucide-react";
import { COL, neu } from "./theme";
import { useAuth } from "./hooks/useAuth";
import { useStopwatch } from "./hooks/useStopwatch";
import { useStudyHistory } from "./hooks/useStudyHistory";
import { useTasks } from "./hooks/useTasks";
import { useGameStats } from "./hooks/useGameStats";
import { watchUserProfile } from "./lib/firestore";
import { syncPushSubscription, isMedianApp } from "./lib/median";

import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import Chat from "./components/Chat";
import Tasks from "./components/Tasks";
import CalendarView from "./components/CalendarView";
import GraphView from "./components/GraphView";
import Settings from "./components/Settings";
import StatusBar from "./components/StatusBar";
import LevelModal from "./components/LevelModal";
import StreakModal from "./components/StreakModal";
import Store, { STORE_ITEMS } from "./components/Store";

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
  const { user, loading, signupWithEmail, loginWithEmail, resetPassword, logout } = useAuth();
  const [tab, setTab] = useState("home");
  const { seconds, todaySeconds, running, toggle, reset, dayKey } = useStopwatch(user?.uid);
  const history = useStudyHistory(user?.uid, 31);
  // Lifted up here (instead of living inside Tasks.jsx) so running-task
  // timers keep counting no matter which tab is open — see useTasks.js.
  const tasks = useTasks(user?.uid);
  const gameStats = useGameStats(user?.uid, running);
  const [showLevel, setShowLevel] = useState(false);
  const [showStreak, setShowStreak] = useState(false);
  const [showStore, setShowStore] = useState(false);

  const activeMascotItem = STORE_ITEMS.find((it) => it.id === gameStats.activeMascot);
  const mascotSrc = activeMascotItem?.img || "/mascot-logo.png";

  // Custom profile overrides (name / DP) stored in Firestore, layered on
  // top of the Google-auth user so a custom profile picture uploaded from
  // Settings shows up everywhere (Dashboard, Settings) without touching
  // the underlying Google account.
  const [profileDoc, setProfileDoc] = useState(null);
  useEffect(() => {
    if (!user) { setProfileDoc(null); return; }
    return watchUserProfile(user.uid, setProfileDoc);
  }, [user]);

  const profile = user
    ? {
        uid: user.uid,
        email: user.email,
        displayName: profileDoc?.name || user.displayName,
        photoURL: profileDoc?.photoURL || user.photoURL,
        username: profileDoc?.username || null,
        // Whether this account can change its password here (only accounts
        // that signed up with email/password have one to change — Google
        // accounts manage their password with Google instead).
        hasPasswordAuth: user.providerData?.some((p) => p.providerId === "password") || false,
      }
    : null;

  // If running inside the Median-wrapped native app, capture this device's
  // OneSignal push subscription id so the server-side reminder cron job
  // (see api/send-study-reminders.js) knows which device to notify. No-ops
  // in a regular browser tab. Re-checked periodically since the OneSignal
  // id may only become available a moment after the user grants push
  // permission on first launch.
  useEffect(() => {
    if (!user?.uid || !isMedianApp()) return;
    syncPushSubscription(user.uid);
    const id = setInterval(() => syncPushSubscription(user.uid), 15000);
    return () => clearInterval(id);
  }, [user?.uid]);

  return (
    <div className="w-full flex items-center justify-center" style={{ background: COL.bg, minHeight: "100dvh" }}>
      {FONT}
      <div className="w-full flex flex-col"
        style={{ height: "100dvh", maxWidth: 480, margin: "0 auto", background: COL.bg }}>

        {loading ? (
          <div className="flex-1 flex items-center justify-center font-body text-sm" style={{ color: COL.sub }}>Loading…</div>
        ) : !user ? (
          <Login
            onSignupWithEmail={signupWithEmail}
            onLoginWithEmail={loginWithEmail}
            onResetPassword={resetPassword}
          />
        ) : (
          <>
            <div className="px-5 pt-5">
              <StatusBar
                streak={gameStats.streak}
                level={gameStats.level}
                coins={gameStats.coins}
                mascotSrc={mascotSrc}
                onOpenStreak={() => setShowStreak(true)}
                onOpenLevel={() => setShowLevel(true)}
                onOpenStore={() => setShowStore(true)}
              />
            </div>

            <div className="flex-1 overflow-y-auto px-5 pt-4 pb-3">
              {tab === "home" && (
                <Dashboard user={profile} bankedSeconds={todaySeconds} displaySeconds={seconds} running={running} onToggle={toggle} onReset={reset}
                  tasks={tasks} goChat={() => setTab("chat")} onLogout={logout} history={history} dayKey={dayKey} />
              )}
              {tab === "chat" && <Chat />}
              {tab === "tasks" && <Tasks uid={user.uid} tasks={tasks} />}
              {tab === "cal" && (
                <div className="flex flex-col gap-6">
                  <CalendarView history={history} todayKey={dayKey} todaySeconds={todaySeconds} />
                  <GraphView history={history} todayKey={dayKey} todaySeconds={todaySeconds} />
                </div>
              )}
              {tab === "settings" && (
                <Settings
                  user={profile}
                  tasks={tasks}
                  taskStats={gameStats.taskStats}
                  coins={gameStats.coins}
                  streak={gameStats.streak}
                  level={gameStats.level}
                  todaySeconds={todaySeconds}
                  history={history}
                  dayKey={dayKey}
                  ownedItems={gameStats.ownedItems}
                  activeMascot={gameStats.activeMascot}
                  studyReminder={profileDoc?.studyReminder}
                  isMedianApp={isMedianApp()}
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

      {showLevel && (
        <LevelModal
          level={gameStats.level}
          xpIntoLevel={gameStats.xpIntoLevel}
          xpForNextLevel={gameStats.xpForNextLevel}
          totalXp={gameStats.totalXp}
          totalXpForNextLevel={gameStats.totalXpForNextLevel}
          onClose={() => setShowLevel(false)}
        />
      )}
      {showStreak && (
        <StreakModal
          streak={gameStats.streak}
          streakDays={gameStats.streakDays}
          onClose={() => setShowStreak(false)}
        />
      )}
      {showStore && (
        <Store
          uid={user.uid}
          coins={gameStats.coins}
          ownedItems={gameStats.ownedItems}
          activeMascot={gameStats.activeMascot}
          onClose={() => setShowStore(false)}
        />
      )}
    </div>
  );
}
