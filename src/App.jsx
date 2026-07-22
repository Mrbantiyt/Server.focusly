// src/App.jsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import { Home, MessageSquare, StickyNote, CalendarDays, Settings as SettingsIcon } from "lucide-react";
import { COL, neu, LIQUID_BG_STYLE, cacheActiveTheme, getActiveTheme, THEMES } from "./theme";
import { useAuth } from "./hooks/useAuth";
import { useCountdownTimer } from "./hooks/useCountdownTimer";
import { useSubjectTimer } from "./hooks/useSubjectTimer";
import { useStudyHistory } from "./hooks/useStudyHistory";
import { useSubjectHistory } from "./hooks/useSubjectHistory";
import { useNotes } from "./hooks/useNotes";
import { useGameStats } from "./hooks/useGameStats";
import { useAchievements } from "./hooks/useAchievements";
import { useNotifications } from "./hooks/useNotifications";
import { useLeaderboard } from "./hooks/useLeaderboard";
import { watchUserProfile, watchAppUpdateConfig, watchMaintenanceConfig, incrementSessionsCompleted, addNote } from "./lib/firestore";
import { getWeekStartKey } from "./lib/time";
import { markAllRead } from "./lib/notifications";
import { syncPushSubscription, isMedianApp } from "./lib/median";

import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import AskAiExternal from "./components/AskAiExternal";
import Notes from "./components/Notes";
import CalendarView from "./components/CalendarView";
import GraphView from "./components/GraphView";
import SubjectStatsView from "./components/SubjectStatsView";
import Settings from "./components/Settings";
import StatusBar from "./components/StatusBar";
import UpdateBanner from "./components/UpdateBanner";
import MaintenanceScreen from "./components/MaintenanceScreen";
import VerifyEmailGate from "./components/VerifyEmailGate";
import LevelModal from "./components/LevelModal";
import StreakModal from "./components/StreakModal";
import AchievementUnlockPopup from "./components/AchievementUnlockPopup";
import NotificationsPanel from "./components/NotificationsPanel";
import Store, { STORE_ITEMS } from "./components/Store";
import Leaderboard from "./components/Leaderboard";
import { useAllStoreItems } from "./lib/storeOverrides";
import { AppLoadingSkeleton } from "./components/Skeleton";

const FONT = (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap');
    .font-display{font-family:'Sora',sans-serif} .font-body{font-family:'Inter',sans-serif}
  `}</style>
);

// Resolved once — same restart-to-apply rule as the rest of theme.js.
const activeThemeId = getActiveTheme();

const NAV = [
  { id: "home", icon: Home, label: "Home" },
  { id: "chat", icon: MessageSquare, label: "Ask AI" },
  { id: "notes", icon: StickyNote, label: "Notes" },
  { id: "cal", icon: CalendarDays, label: "Calendar" },
  { id: "settings", icon: SettingsIcon, label: "Settings" },
];

// Stable reference (not a fresh [] every render) — see comment where it's
// used below.
const EMPTY_TASKS = [];

export default function App() {
  const { user, loading, isAdmin, signupWithEmail, loginWithEmail, resetPassword, logout, sendOtp, verifyOtp, requestEmailChange, confirmEmailChange } = useAuth();
  const [tab, setTab] = useState("home");
  const {
    remaining: timerRemaining, durationSeconds: timerDuration, running, finished: timerFinished,
    todaySeconds, setDuration: setTimerDuration, start: startTimer, pause: pauseTimer, reset: resetTimer, dayKey,
    creditExternalSeconds,
  } = useCountdownTimer(user?.uid);
  // Custom (multi-subject) Timer — each elapsed second is credited to the
  // Study Timer's overall "Time today" bank (via creditExternalSeconds
  // here), per spec: total time should reflect all studying, however it
  // was timed. It no longer keeps its own separate per-subject breakdown
  // ("Today by Subject" was removed).
  const subjectTimer = useSubjectTimer(user?.uid, { onElapsedSecond: creditExternalSeconds });
  const history = useStudyHistory(user?.uid, 31);
  const subjectHistory = useSubjectHistory(user?.uid, 31);
  // Tasks tab was removed and replaced by Notes. `tasks` is kept as a
  // stable empty array (not lifted from a hook anymore) purely so the
  // existing Dashboard/Settings stat panels — which still read a `tasks`
  // array for their "today's tasks" counter — don't need a separate
  // prop-shape change. Live task tracking (and its once-a-second
  // re-render tick) is gone for good, which is also a real perf win.
  const tasks = EMPTY_TASKS;
  const { notes } = useNotes(user?.uid);
  // Bottom-nav "+" button: creates a note immediately (from anywhere in the
  // app), switches to the Notes tab, and hands the fresh note's id to
  // <Notes> so it opens straight into the editor. `pendingNoteId` is
  // cleared once Notes has consumed it, so re-visiting the Notes tab later
  // doesn't keep re-opening that same note.
  const [pendingNoteId, setPendingNoteId] = useState(null);
  const [creatingNote, setCreatingNote] = useState(false);
  const handleQuickAddNote = useCallback(async () => {
    if (!user || creatingNote) return;
    setCreatingNote(true);
    try {
      const id = await addNote(user.uid, "");
      setPendingNoteId(id);
      setSettingsInitialSection(null);
      setTab("notes");
    } finally {
      setCreatingNote(false);
    }
  }, [user, creatingNote]);
  // Custom profile overrides (name / DP / billing) stored in Firestore,
  // layered on top of the Google-auth user. Declared here (before
  // gameStats) so its `billing` field can be passed straight into
  // useGameStats below for plan-aware XP/coin reward rates.
  const [profileDoc, setProfileDoc] = useState(null);
  useEffect(() => {
    if (!user) { setProfileDoc(null); return; }
    return watchUserProfile(user.uid, setProfileDoc);
  }, [user]);
  // XP/coin accrual should run while EITHER timer is actively counting —
  // previously only the Study (countdown) Timer's `running` was passed in,
  // so time spent in the Custom (multi-subject) Timer banked "Time today"
  // but never earned XP/coins. ORing both `running` flags fixes that
  // without touching how either timer works internally.
  const gameStats = useGameStats(user?.uid, running || subjectTimer.running, profileDoc?.billing);
  const { notifications, unreadCount } = useNotifications(user?.uid);
  const [showLevel, setShowLevel] = useState(false);
  const [showStreak, setShowStreak] = useState(false);
  const [showStore, setShowStore] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  // Detects the moment `gameStats.level` ticks up (from the live Firestore
  // snapshot) so LevelModal can play its one-time celebration animation
  // instead of just silently showing the new number.
  //
  // Bug this guards against: useGameStats' `stats` state starts as a local
  // default (`xp: 0` before Firestore's first real snapshot arrives), which
  // itself resolves to a level (e.g. level 1). The OLD guard only checked
  // "is prevLevelRef non-null", so it still counted that default-state
  // level as a legitimate baseline — the instant the real snapshot then
  // landed (e.g. level 5), it read as a jump from 1 -> 5 and wrongly
  // treated every app load as a level-up, popping the celebration modal
  // unprompted.
  //
  // Fix: wait for `gameStats.loaded` (true only once a REAL Firestore
  // snapshot has landed) before ever recording a baseline. The first real
  // level seen for a signed-in uid is always just recorded, never
  // compared — only a real increase seen WHILE the app stays open counts.
  const prevLevelRef = useRef(null);
  const levelBaselineUidRef = useRef(null);
  const [justLeveledUp, setJustLeveledUp] = useState(false);
  useEffect(() => {
    if (!user?.uid || !gameStats.loaded) return;
    const lvl = gameStats.level;
    if (lvl == null) return;

    // Signed-in user changed (fresh login/logout/switch): reset the
    // baseline so a different account's level isn't compared against a
    // stale ref from the previous session.
    if (levelBaselineUidRef.current !== user.uid) {
      levelBaselineUidRef.current = user.uid;
      prevLevelRef.current = lvl;
      return;
    }

    if (prevLevelRef.current != null && lvl > prevLevelRef.current) {
      setJustLeveledUp(true);
      setShowLevel(true);
    }
    prevLevelRef.current = lvl;
  }, [gameStats.level, gameStats.loaded, user?.uid]);

  // Lifetime study seconds across all days (today included), used by
  // Settings' "Total study time" stat (dayKey excluded from the history sum
  // since today comes from the live todaySeconds instead, to avoid double
  // counting).
  const totalStudySeconds =
    Object.entries(history).reduce((sum, [k, v]) => sum + (k === dayKey ? 0 : v), 0) + todaySeconds;

  // Achievements watch a combined snapshot: everything gameStats already
  // tracks (sessionsCompleted, streak, totalXp, lifetimeCoinsEarned,
  // subjectSeconds, unlockedAchievements, loaded) plus totalStudySeconds,
  // which only exists here at the App level (it's derived from
  // history + todaySeconds, not stored directly on the user doc).
  const { achievements, currentCelebration, dismissNextCelebration } = useAchievements(user?.uid, {
    ...gameStats,
    totalStudySeconds,
  });

  // Credits one completed Study Timer session the moment the countdown
  // naturally finishes (edge-triggered on finished going false -> true, via
  // sessionCreditedRef, so it fires exactly once per completion — not on
  // every render while `finished` stays true, and not again if the user
  // just leaves the finished screen up without resetting).
  const sessionCreditedRef = useRef(false);
  useEffect(() => {
    if (!user?.uid) return;
    if (timerFinished && !sessionCreditedRef.current) {
      sessionCreditedRef.current = true;
      incrementSessionsCompleted(user.uid).catch((err) => {
        console.warn("[achievements] Failed to credit session:", err);
      });
    }
    if (!timerFinished) {
      sessionCreditedRef.current = false;
    }
  }, [timerFinished, user?.uid]);

  // Same one-time credit, but for the Custom (multi-subject) Timer
  // finishing its whole plan — a completed subject-timer run counts as a
  // completed session too, same as the Study Timer.
  const subjectSessionCreditedRef = useRef(false);
  useEffect(() => {
    if (!user?.uid) return;
    if (subjectTimer.finished && !subjectSessionCreditedRef.current) {
      subjectSessionCreditedRef.current = true;
      incrementSessionsCompleted(user.uid).catch((err) => {
        console.warn("[achievements] Failed to credit subject-timer session:", err);
      });
    }
    if (!subjectTimer.finished) {
      subjectSessionCreditedRef.current = false;
    }
  }, [subjectTimer.finished, user?.uid]);

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

  // All purchasable mascots: hardcoded base list plus any admin-added
  // custom items / name-price overrides from Firestore (see Store.jsx for
  // the full merge logic — this mirrors it at the App level so a custom
  // mascot the user has set as active resolves correctly here too, not
  // just inside the Store panel itself).
  // Keeps the local cache theme.js reads (synchronously, at next boot)
  // aligned with whatever the user last equipped in the Store. Per product
  // decision this does NOT change anything on screen right now — theme.js
  // already resolved ACTIVE_THEME once, at module load, before this ever
  // runs — it only affects what the app looks like the NEXT time it starts.
  useEffect(() => {
    if (!gameStats.loaded) return;
    const firestoreTheme = gameStats.activeTheme || "default";
    cacheActiveTheme(firestoreTheme);

    // Auto-apply without requiring a manual "Reload now" tap: if the theme
    // this tab already rendered with (resolved once, synchronously, from
    // the local cache at module load — see theme.js) doesn't match what
    // Firestore says is actually active, this tab is stale — most likely
    // the very first load on a new device/browser (nothing cached yet, so
    // theme.js defaulted) or a theme that was equipped from another
    // device/tab. Reload once so the user sees the right theme immediately
    // instead of only on their next manual app open.
    //
    // Guarded with a sessionStorage flag (not just a ref) so a genuinely
    // failed/reverted theme write can't loop-reload forever within the same
    // tab session — we only ever force one auto-reload per tab lifetime.
    if (firestoreTheme !== getActiveTheme()) {
      const alreadyReloaded = sessionStorage.getItem("focusly:themeAutoReloaded");
      if (!alreadyReloaded) {
        sessionStorage.setItem("focusly:themeAutoReloaded", "1");
        window.location.reload();
      }
    }
  }, [gameStats.loaded, gameStats.activeTheme]);

  const allStoreItems = useAllStoreItems(STORE_ITEMS);
  const activeMascotItem = allStoreItems.find((it) => it.id === gameStats.activeMascot);
  const mascotSrc = activeMascotItem?.img || "/mascot-logo.png";

  // "App is now updated" banner — controlled from the admin panel. Watched
  // independently of the user profile (not gated on `user`) so it's ready
  // the moment the main app screen mounts, and updates live if an admin
  // flips it on/off while the app is already open.
  const [appUpdateConfig, setAppUpdateConfig] = useState(null);
  useEffect(() => watchAppUpdateConfig(setAppUpdateConfig), []);

  // Maintenance-mode screen — same "ready before `user` resolves" reasoning
  // as the update banner above, so it can block the screen the instant it's
  // needed even before the profile doc loads. Whether it actually BLOCKS
  // anything also depends on `isAdmin` (see the render gate below) — an
  // admin account never sees this screen, even while it's enabled.
  const [maintenanceConfig, setMaintenanceConfig] = useState(null);
  useEffect(() => watchMaintenanceConfig(setMaintenanceConfig), []);

  const profile = user
    ? {
        uid: user.uid,
        email: user.email,
        displayName: profileDoc?.name || user.displayName,
        photoURL: profileDoc?.photoURL || user.photoURL,
        username: profileDoc?.username || null,
        // Set true by /api/verify-otp once the user enters the correct
        // code. Read here so the VerifyEmailBanner actually disappears
        // after verification instead of showing forever.
        emailVerified: profileDoc?.emailVerified || false,
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
  // (see api/send-study-reminders.js) and the timer-completion notification
  // (see api/schedule-timer-notification.js) know which device to notify.
  // No-ops in a regular browser tab. Re-checked periodically since the
  // OneSignal id may only become available a moment after the user grants
  // push permission on first launch. The status is kept in state (rather
  // than only logged) so Settings > Notifications can show the person
  // exactly what's happening, without needing to open a browser console.
  const [pushStatus, setPushStatus] = useState({ state: "checking" });
  useEffect(() => {
    if (!user?.uid || !isMedianApp()) { setPushStatus({ state: "not-median" }); return; }
    let cancelled = false;
    const run = () => {
      syncPushSubscription(user.uid).then((status) => {
        if (!cancelled && status) setPushStatus(status);
      });
    };
    run();
    const id = setInterval(run, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [user?.uid]);

  // Lets Settings > Notifications force an immediate re-check (rather than
  // waiting for the next 15s poll) the moment that screen opens — e.g.
  // right after the person grants push permission and backgrounds/
  // foregrounds the app, or just to confirm the connection is still good.
  const refreshPushStatus = useCallback(() => {
    if (!user?.uid || !isMedianApp()) return;
    syncPushSubscription(user.uid).then((status) => {
      if (status) setPushStatus(status);
    });
  }, [user?.uid]);

  return (
    <div className="w-full flex items-center justify-center" style={{ ...LIQUID_BG_STYLE, minHeight: "100dvh" }}>
      {FONT}
      <div className="w-full flex flex-col"
        style={{ height: "100dvh", maxWidth: 480, margin: "0 auto", ...LIQUID_BG_STYLE, backgroundAttachment: "fixed" }}>

        {loading ? (
          <AppLoadingSkeleton />
        ) : !user ? (
          <Login
            onSignupWithEmail={signupWithEmail}
            onLoginWithEmail={loginWithEmail}
            onResetPassword={resetPassword}
          />
        ) : maintenanceConfig?.enabled && !isAdmin ? (
          <MaintenanceScreen config={maintenanceConfig} />
        ) : profile && !profile.emailVerified ? (
          <VerifyEmailGate email={profile.email} onSendOtp={sendOtp} onVerifyOtp={verifyOtp} onLogout={logout} />
        ) : (
          <>
            <div className="px-5 pt-5">
              <UpdateBanner config={appUpdateConfig} />
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
                <Dashboard user={profile} bankedSeconds={todaySeconds}
                  timerRemaining={timerRemaining} timerDuration={timerDuration} timerRunning={running} timerFinished={timerFinished}
                  onTimerSetDuration={setTimerDuration} onTimerStart={startTimer} onTimerPause={pauseTimer} onTimerReset={resetTimer}
                  subjectTimer={subjectTimer}
                  tasks={tasks} notesCount={notes.length} goChat={() => setTab("chat")} onLogout={logout} history={history} dayKey={dayKey}
                  unreadCount={unreadCount} myLeaderboardRank={myLeaderboardRank}
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

              {tab === "notes" && (
                <Notes
                  uid={user.uid}
                  notes={notes}
                  pendingOpenId={pendingNoteId}
                  onConsumePendingOpenId={() => setPendingNoteId(null)}
                />
              )}
              {tab === "cal" && (
                <div className="flex flex-col gap-6">
                  <CalendarView history={history} todayKey={dayKey} todaySeconds={todaySeconds} />
                  <GraphView history={history} todayKey={dayKey} todaySeconds={todaySeconds} />
                  <SubjectStatsView
                    history={history}
                    todayKey={dayKey}
                    todaySeconds={todaySeconds}
                    subjectHistory={subjectHistory}
                  />
                </div>
              )}
              {tab === "settings" && (
                <Settings
                  user={profile}
                  pushStatus={pushStatus}
                  oneSignalUserId={profileDoc?.oneSignalUserId || null}
                  onRefreshPushStatus={refreshPushStatus}
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
                  ownedThemes={gameStats.ownedThemes}
                  activeTheme={gameStats.activeTheme}
                  billing={profileDoc?.billing}
                  lastStreakDay={gameStats.lastStreakDay}
                  onOpenStreak={() => setShowStreak(true)}
                  achievements={achievements}
                  studyReminder={profileDoc?.studyReminder}
                  isMedianApp={isMedianApp()}
                  initialSection={settingsInitialSection}
                  totalStudySeconds={totalStudySeconds}
                  onLogout={logout}
                  myLeaderboardRank={myLeaderboardRank}
                  leaderboardRows={leaderboardRows}
                  leaderboardLoading={leaderboardLoading}
                  requestEmailChange={requestEmailChange}
                  confirmEmailChange={confirmEmailChange}
                />
              )}
            </div>

            <div className="px-5 pb-5 pt-2">
              {activeThemeId === THEMES.aura ? (
                (() => {
                  const home = NAV.find((n) => n.id === "home");
                  const rest = NAV.filter((n) => n.id !== "home");
                  const left = rest.slice(0, 2);
                  const right = rest.slice(2);
                  const HomeIcon = home.icon;
                  const homeActive = tab === home.id;
                  const renderSide = (items) =>
                    items.map((n) => {
                      const Icon = n.icon, active = tab === n.id;
                      return (
                        <button
                          key={n.id}
                          onClick={() => {
                            setTab(n.id);
                            setSettingsInitialSection(null);
                          }}
                          className="flex-1 flex flex-col items-center gap-1"
                        >
                          <Icon size={21} color={active ? COL.violet : COL.sub} strokeWidth={active ? 2.4 : 2} />
                          <span
                            className="font-body text-[11px] font-semibold"
                            style={{ color: active ? COL.violet : COL.sub }}
                          >
                            {n.label}
                          </span>
                        </button>
                      );
                    });
                  return (
                    <div className="relative" style={{ height: 104 }}>
                      {/*
                        The bar's own silhouette dips into a notch around the
                        floating Home button (matching the reference) rather
                        than being a plain pill with a button on top — a
                        rounded-rect can't do this, so the bar itself is an
                        SVG path: two small peaks either side of a central
                        semicircular dip, dropping into rounded bottom
                        corners. `preserveAspectRatio="none"` lets the path
                        stretch to fill whatever width the phone actually
                        has (rather than the fixed 340px mock width),
                        keeping every corner/curve proportionally in place
                        instead of just clipping or shrinking on real
                        devices.
                      */}
                      <svg
                        className="absolute inset-0 w-full h-full"
                        viewBox="0 0 340 104"
                        preserveAspectRatio="none"
                        style={{ filter: "drop-shadow(0 2px 10px rgba(20,30,50,0.10))" }}
                      >
                        <path
                          d="M 20 34
                             C 60 34, 95 4, 130 4
                             C 150 4, 148 38, 170 38
                             C 192 38, 190 4, 210 4
                             C 245 4, 280 34, 320 34
                             L 320 84
                             C 320 94.5, 311.5 103, 301 103
                             L 39 103
                             C 28.5 103, 20 94.5, 20 84
                             Z"
                          fill={COL.card}
                        />
                      </svg>

                      <div className="relative flex items-end justify-between h-full px-5 pb-3.5">
                        {renderSide(left)}
                        {/* Spacer keeping the side groups clear of the notch/floating button */}
                        <div className="w-16 flex-shrink-0" />
                        {renderSide(right)}
                      </div>

                      <button
                        onClick={() => {
                          setTab(home.id);
                          setSettingsInitialSection(null);
                        }}
                        aria-label={home.label}
                        style={{
                          background: COL.violet,
                          boxShadow: "0 8px 20px rgba(22,64,107,0.4)",
                        }}
                        className="absolute left-1/2 -translate-x-1/2 top-1 w-[58px] h-[58px] rounded-full flex items-center justify-center active:scale-95 transition"
                      >
                        <HomeIcon size={23} color="#FFFFFF" strokeWidth={homeActive ? 2.4 : 2} />
                      </button>
                    </div>
                  );
                })()
              ) : (
                <div
                  style={neu(false, 999)}
                  className="flex items-center justify-between px-2 py-2 min-w-0"
                >
                  {NAV.map((n) => {
                    const Icon = n.icon, active = tab === n.id;
                    return (
                      <button
                        key={n.id}
                        onClick={() => {
                          setTab(n.id);
                          setSettingsInitialSection(null);
                        }}
                        style={
                          active
                            ? {
                                background: COL.violet,
                                borderRadius: 999,
                                boxShadow:
                                  activeThemeId === THEMES.neomorphism
                                    ? "3px 3px 8px rgba(163,158,152,0.4), -3px -3px 8px rgba(255,255,255,0.7)"
                                    : "0 4px 14px rgba(123,110,246,0.45)",
                              }
                            : undefined
                        }
                        className={`flex items-center gap-1.5 transition-all duration-200 ${
                          active ? "px-3.5 py-2" : "px-2.5 py-2"
                        }`}
                      >
                        <Icon size={17} color={active ? "#FFFFFF" : COL.sub} />
                        {active && (
                          <span className="font-body text-xs font-semibold whitespace-nowrap text-white">
                            {n.label}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
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
          xpPerTick={gameStats.xpPerTick}
          justLeveledUp={justLeveledUp}
          onClose={() => { setShowLevel(false); setJustLeveledUp(false); }}
        />
      )}
      {currentCelebration && (
        <AchievementUnlockPopup
          achievement={currentCelebration}
          onDone={dismissNextCelebration}
        />
      )}
      {showStreak && (
        <StreakModal
          streak={gameStats.streak}
          streakDays={gameStats.streakDays}
          lastStreakDay={gameStats.lastStreakDay}
          uid={user.uid}
          coins={gameStats.coins}
          onClose={() => setShowStreak(false)}
        />
      )}
      {showStore && (
        <Store
          uid={user.uid}
          coins={gameStats.coins}
          ownedItems={gameStats.ownedItems}
          activeMascot={gameStats.activeMascot}
          ownedThemes={gameStats.ownedThemes}
          activeTheme={gameStats.activeTheme}
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
