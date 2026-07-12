// src/App.jsx
import React, { useEffect, useState } from "react";
import { Home, MessageSquare, StickyNote, CalendarDays, Settings as SettingsIcon } from "lucide-react";
import { COL, neu } from "./theme";
import { useAuth } from "./hooks/useAuth";
import { useStopwatch } from "./hooks/useStopwatch";
import { useStudyHistory } from "./hooks/useStudyHistory";
import { useNotes } from "./hooks/useNotes";
import { useGameStats } from "./hooks/useGameStats";
import { useNotifications } from "./hooks/useNotifications";
import { useLeaderboard } from "./hooks/useLeaderboard";
import { watchUserProfile } from "./lib/firestore";
import { getWeekStartKey } from "./lib/time";
import { markAllRead } from "./lib/notifications";
import { syncPushSubscription, isMedianApp } from "./lib/median";

import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import AskAiExternal from "./components/AskAiExternal";
import Notes from "./components/Notes";
import CalendarView from "./components/CalendarView";
import GraphView from "./components/GraphView";
import Settings from "./components/Settings";
import StatusBar from "./components/StatusBar";
import LevelModal from "./components/LevelModal";
import StreakModal from "./components/StreakModal";
import NotificationsPanel from "./components/NotificationsPanel";
import Store, { STORE_ITEMS } from "./components/Store";
import Leaderboard from "./components/Leaderboard";
import { AppLoadingSkeleton } from "./components/Skeleton";

const FONT = (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap');
    .font-display{font-family:'Sora',sans-serif} .font-body{font-family:'Inter',sans-serif}
  `}</style>
);

const NAV = [
  { id: "home", icon: Home },
  { id: "chat", icon: MessageSquare },
  { id: "notes", icon: StickyNote },
  { id: "cal", icon: CalendarDays },
  { id: "settings", icon: SettingsIcon },
];

// Stable reference (not a fresh [] every render) — see comment where it's
// used below.
const EMPTY_TASKS = [];

export default function App() {
  const { user, loading, signupWithEmail, loginWithEmail, resetPassword, logout } = useAuth();
  const [tab, setTab] = useState("home");
  const { seconds, todaySeconds, running, toggle, reset, dayKey } = useStopwatch(user?.uid);
  const history = useStudyHistory(user?.uid, 31);
  // Tasks tab was removed and replaced by Notes. `tasks` is kept as a
  // stable empty array (not lifted from a hook anymore) purely so the
  // existing Dashboard/Settings stat panels — which still read a `tasks`
  // array for their "today's tasks" counter — don't need a separate
  // prop-shape change. Live task tracking (and its once-a-second
  // re-render tick) is gone for good, which is also a real perf win.
  const tasks = EMPTY_TASKS;
  const { notes } = useNotes(user?.uid);
  const gameStats = useGameStats(user?.uid, running);
  const { notifications, unreadCount } = useNotifications(user?.uid);
  const [showLevel, setShowLevel] = useState(false);
  const [showStreak, setShowStreak] = useState(false);
  const [showStore, setShowStore] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  // Lifetime study seconds across all days (today included), used by
  // Settings' "Total study time" stat (dayKey excluded from the history sum
  // since today comes from the live todaySeconds instead, to avoid double
  // counting).
  const totalStudySeconds =
    Object.entries(history).reduce((sum, [k, v]) => sum + (k === dayKey ? 0 : v), 0) + todaySeconds;

  // Study seconds since THIS week's Monday (today included) — what the
  // leaderboard now ranks on, so it naturally resets every Monday.
  const weekStartKey = getWeekStartKey();
  const weeklyStudySeconds =
    Object.entries(history).reduce(
      (sum, [k, v]) => sum + (k >= weekStartKey && k !== dayKey ? v : 0),
      0
    ) + todaySeconds;
  // When set, Settings mounts straight into that section (e.g. "billing")
  // instead of its main menu — used by the "Upgrade plan" button on the
  // Ask AI time-limit card. Cleared once consumed so navigating to
  // Settings normally afterwards still opens on the main menu.
  const [settingsInitialSection, setSettingsInitialSection] = useState(null);

  const goToBilling = () => {
    setSettingsInitialSection("billing");
    setTab("settings");
  };

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

  // Keeps this user's public leaderboard/{uid} mirror doc in sync (username,
  // lifetime + this-week study time, streak, level) AND live-watches the
  // ranked list, for as long as the user is signed in — not just while a
  // specific tab/panel is open. A top-50 listener is cheap enough to keep
  // running for the whole session, and doing it this way means "Your rank
  // in leaderboard" is instantly correct everywhere it's shown (Home,
  // Weekly Analytics, Your Data, the Leaderboard panel itself) with no
  // flicker or stale "—" while switching tabs.
  const { rows: leaderboardRows, loading: leaderboardLoading } = useLeaderboard(
    user?.uid,
    { username: profile?.username, totalStudySeconds, weeklyStudySeconds, streak: gameStats.streak, level: gameStats.level },
    !!user?.uid,
    { weekly: true }
  );

  const myLeaderboardRank = user?.uid
    ? (leaderboardRows.findIndex((r) => r.uid === user.uid) + 1) || null
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
          <AppLoadingSkeleton />
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
                onOpenLeaderboard={() => setShowLeaderboard(true)}
              />
            </div>

            <div className="flex-1 overflow-y-auto px-5 pt-4 pb-3">
              {tab === "home" && (
                <Dashboard user={profile} bankedSeconds={todaySeconds} displaySeconds={seconds} running={running} onToggle={toggle} onReset={reset}
                  tasks={tasks} notesCount={notes.length} goChat={() => setTab("chat")} onLogout={logout} history={history} dayKey={dayKey}
                  unreadCount={unreadCount}
                  onOpenNotifications={() => {
                    setShowNotifications(true);
                    if (user?.uid) markAllRead(user.uid, notifications);
                  }}
                />
              )}
              {/*
                NoteGPT is embedded here instead of our own AI chat. It's
                kept mounted at all times (hidden via CSS when another tab
                is active) just like Chat was, so switching tabs doesn't
                reload the iframe every time.
              */}
              <div style={{ display: tab === "chat" ? "block" : "none", height: "100%" }}>
                <AskAiExternal user={user} billing={profileDoc?.billing} aiUsage={profileDoc?.aiUsage} dayKey={dayKey} onUpgradePlan={goToBilling} />
              </div>

              {tab === "notes" && <Notes uid={user.uid} notes={notes} />}
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
                  billing={profileDoc?.billing}
                  studyReminder={profileDoc?.studyReminder}
                  isMedianApp={isMedianApp()}
                  initialSection={settingsInitialSection}
                  totalStudySeconds={totalStudySeconds}
                  onLogout={logout}
                  myLeaderboardRank={myLeaderboardRank}
                  leaderboardRows={leaderboardRows}
                  leaderboardLoading={leaderboardLoading}
                />
              )}
            </div>

            <div className="px-5 pb-5 pt-2">
              <div style={neu(false, 24)} className="flex items-center justify-between px-4 py-3">
                {NAV.map((n) => {
                  const Icon = n.icon, active = tab === n.id;
                  return (
                    <button
                      key={n.id}
                      onClick={() => {
                        setTab(n.id);
                        setSettingsInitialSection(null);
                      }}
                      className="flex flex-col items-center gap-1"
                    >
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
      {showNotifications && (
        <NotificationsPanel
          uid={user.uid}
          notifications={notifications}
          onClose={() => setShowNotifications(false)}
        />
      )}
      {showLeaderboard && (
        <Leaderboard
          rows={leaderboardRows}
          loading={leaderboardLoading}
          myUid={user.uid}
          onClose={() => setShowLeaderboard(false)}
        />
      )}
    </div>
  );
}
