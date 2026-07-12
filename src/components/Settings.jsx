// src/components/Settings.jsx
//
// Redesigned as a menu list (matching the reference screenshots) instead of
// one long scrolling page. Tapping a row opens that section as a full-panel
// overlay with a back button, then returns to the same menu.
import React, { useState } from "react";
import {
  ChevronLeft, ChevronRight, LogOut, Pencil, Check, Flame,
  Camera, Loader2, Coins, Shield, AtSign, KeyRound, X, User, Palette, Bell,
  Database, HelpCircle, Clock, TrendingUp, TrendingDown, BarChart3, CreditCard, Gift, Sparkles, ExternalLink,
  Trophy,
} from "lucide-react";
import { COL, neu } from "../theme";
import { fmtHrs, fmtCompact, getWeekStartKey } from "../lib/time";
import { updateUserProfile, claimUsername, setActiveMascot, redeemCode } from "../lib/firestore";
import { getEffectivePlan, getAiMessageLimit, getDaysRemaining, PLAN, PLAN_LABELS } from "../lib/billing";
import { auth, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "../firebase";
import { STORE_ITEMS } from "./Store";
import { LeaderboardPanel } from "./Leaderboard";

/* ------------------------------- shared bits ------------------------------- */

// A single tappable row on the main Settings menu.
function MenuRow({ icon: Icon, iconBg, iconColor, label, onClick }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 py-2.5 active:opacity-70 transition text-left">
      <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
        <Icon size={19} color={iconColor} />
      </div>
      <div className="flex-1 font-display font-semibold text-[15px]" style={{ color: COL.ink }}>{label}</div>
      <ChevronRight size={18} color={COL.sub} />
    </button>
  );
}

function SectionLabel({ children }) {
  return <div className="font-display font-bold text-sm px-0.5 mt-1" style={{ color: COL.ink }}>{children}</div>;
}

// Full-panel header shared by every sub-section, with a back arrow.
function PanelHeader({ title, onBack }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0" style={neu(false, 999)}>
        <ChevronLeft size={17} color={COL.ink} />
      </button>
      <div className="font-display font-bold text-lg" style={{ color: COL.ink }}>{title}</div>
    </div>
  );
}

/* ------------------------------ Account Settings ------------------------------ */

function AccountSettingsPanel({ user, ownedItems, onBack }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.displayName || "Student");
  const [savingDp, setSavingDp] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState(user.username || "");
  const [usernameBusy, setUsernameBusy] = useState(false);
  const [usernameError, setUsernameError] = useState("");

  const saveUsername = async () => {
    setUsernameError("");
    const trimmed = usernameInput.trim();
    if (!trimmed || trimmed === user.username) { setEditingUsername(false); return; }
    setUsernameBusy(true);
    try {
      await claimUsername(user.uid, trimmed, user.email);
      setEditingUsername(false);
    } catch (e) {
      setUsernameError(e.message || "Couldn't update username.");
    } finally {
      setUsernameBusy(false);
    }
  };

  // DP is now chosen from the same mascot collection used for the app icon
  // (Customize panel) instead of an arbitrary photo from the gallery — this
  // keeps every profile picture a known, safe, pre-approved image rather
  // than user-uploaded content.
  const owned = ownedItems || [];
  const collection = STORE_ITEMS.filter((it) => owned.includes(it.id));

  const choosePhoto = async (item) => {
    setSavingDp(true);
    try {
      await updateUserProfile(user.uid, { photoURL: item.img });
      setPickerOpen(false);
    } catch (e) {
      alert("Couldn't update profile picture: " + e.message);
    } finally {
      setSavingDp(false);
    }
  };

  const saveName = async () => {
    if (name.trim()) await updateUserProfile(user.uid, { name: name.trim() });
    setEditing(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <PanelHeader title="Account Settings" onBack={onBack} />

      <div style={neu(false, 22)} className="p-5 flex flex-col items-center gap-3">
        <div className="relative">
          {user.photoURL ? (
            <img src={user.photoURL} alt={name} className="w-16 h-16 rounded-3xl object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-3xl flex items-center justify-center font-display font-bold text-2xl text-white"
              style={{ background: `linear-gradient(135deg, ${COL.blue}, ${COL.violet})` }}>{(name[0] || "S").toUpperCase()}</div>
          )}
          <button onClick={() => setPickerOpen(true)} disabled={savingDp}
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center border-2"
            style={{ background: COL.violet, borderColor: COL.card }}>
            {savingDp ? <Loader2 size={12} color="#fff" className="animate-spin" /> : <Camera size={12} color="#fff" />}
          </button>
        </div>

        {pickerOpen && (
          <div style={neu(true, 18)} className="w-full p-4 flex flex-col gap-3">
            <div className="font-body text-xs" style={{ color: COL.sub }}>
              Choose a profile picture from your unlocked collection.
            </div>
            {collection.length === 0 ? (
              <div className="font-body text-xs text-center py-3" style={{ color: COL.sub }}>
                You haven't unlocked any icons yet — buy a theme in the Store to use it as your DP.
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-3">
                {collection.map((item) => (
                  <button key={item.id} onClick={() => choosePhoto(item)} disabled={savingDp}
                    className="rounded-2xl overflow-hidden active:scale-95 transition"
                    style={{
                      boxShadow: user.photoURL === item.img
                        ? `0 0 0 2px ${COL.violet}`
                        : "none",
                    }}>
                    <img src={item.img} alt={item.name} className="w-full aspect-square object-cover" />
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setPickerOpen(false)} className="font-body text-xs" style={{ color: COL.sub }}>
              Cancel
            </button>
          </div>
        )}

        {editing ? (
          <div className="flex items-center gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveName()}
              className="font-body text-sm px-2 py-1 rounded-lg outline-none text-center" style={{ background: COL.input, color: COL.ink }} />
            <button onClick={saveName} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: COL.mint }}>
              <Check size={13} color="#fff" />
            </button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1.5">
            <span className="font-display font-semibold text-base" style={{ color: COL.ink }}>{name}</span>
            <Pencil size={12} color={COL.sub} />
          </button>
        )}

        <span className="font-body text-xs" style={{ color: COL.sub }}>{user.email}</span>

        {editingUsername ? (
          <div className="flex flex-col items-center gap-1.5 w-full">
            <div className="flex items-center gap-2">
              <AtSign size={13} color={COL.sub} />
              <input value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveUsername()}
                className="font-body text-sm px-2 py-1 rounded-lg outline-none text-center"
                style={{ background: COL.input, color: COL.ink }} />
              <button onClick={saveUsername} disabled={usernameBusy}
                className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: COL.mint }}>
                {usernameBusy ? <Loader2 size={13} color="#fff" className="animate-spin" /> : <Check size={13} color="#fff" />}
              </button>
              <button onClick={() => { setEditingUsername(false); setUsernameInput(user.username || ""); setUsernameError(""); }}
                className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: COL.sub }}>
                <X size={13} color="#fff" />
              </button>
            </div>
            {usernameError && <div className="font-body text-[11px]" style={{ color: COL.coral }}>{usernameError}</div>}
          </div>
        ) : (
          <button onClick={() => setEditingUsername(true)} className="flex items-center gap-1.5">
            <span className="font-body text-xs" style={{ color: COL.sub }}>
              {user.username ? `@${user.username}` : "Set a username"}
            </span>
            <Pencil size={11} color={COL.sub} />
          </button>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- Customize --------------------------------- */

function CustomizePanel({ uid, ownedItems, activeMascot, onBack }) {
  const owned = ownedItems || [];
  const collection = STORE_ITEMS.filter((it) => owned.includes(it.id));

  const handleEquip = async (itemId) => {
    if (!uid) return;
    await setActiveMascot(uid, itemId);
  };

  return (
    <div className="flex flex-col gap-5">
      <PanelHeader title="Customize" onBack={onBack} />

      <div className="font-display font-semibold text-base" style={{ color: COL.ink }}>App icon</div>
      <div className="font-body text-xs -mt-3" style={{ color: COL.sub }}>
        Pick which mascot shows as your app icon, from the ones you've bought in the Store.
      </div>

      {collection.length === 0 ? (
        <div style={{ ...neu(true, 20), color: COL.sub }} className="p-5 text-center font-body text-xs">
          You haven't unlocked any icons yet — buy a theme in the Store to see it here.
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {collection.map((item) => {
            const active = activeMascot === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleEquip(item.id)}
                className="flex flex-col items-center gap-1 active:scale-95 transition"
              >
                <div
                  className="w-14 h-14 rounded-2xl overflow-hidden"
                  style={{
                    boxShadow: active
                      ? `0 0 0 2px ${COL.violet}, 4px 4px 10px rgba(163,170,199,0.4)`
                      : "4px 4px 10px rgba(163,170,199,0.4), -4px -4px 10px rgba(255,255,255,0.85)",
                  }}
                >
                  <img src={item.img} alt={item.name} className="w-full h-full object-cover" />
                </div>
                <span className="font-body text-[10px]" style={{ color: active ? COL.violet : COL.sub }}>
                  {active ? "In use" : "Use"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------------------------------- Notifications -------------------------------- */

function NotificationsPanel({ uid, studyReminder, isMedianApp, onBack }) {
  const [enabled, setEnabled] = useState(studyReminder?.enabled ?? false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const onToggle = async () => {
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    setSaved(false);
    try {
      await updateUserProfile(uid, { studyReminder: { enabled: next } });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PanelHeader title="Notifications" onBack={onBack} />

      {!isMedianApp && (
        <div style={neu(true, 20)} className="p-4 flex items-start gap-2.5">
          <Bell size={16} color={COL.sub} className="mt-0.5 flex-shrink-0" />
          <div className="font-body text-xs leading-relaxed" style={{ color: COL.sub }}>
            Push notifications only work in the Focusly app (not in a browser tab). You can still turn this
            on here — it'll take effect once you open Focusly from the app.
          </div>
        </div>
      )}

      <div style={neu(false, 20)} className="p-4">
        <button onClick={onToggle} className="w-full flex items-center justify-between text-left">
          <div>
            <div className="font-display font-semibold text-sm" style={{ color: COL.ink }}>Study reminder</div>
            <div className="font-body text-xs mt-0.5" style={{ color: COL.sub }}>
              Get a daily push notification at 6:00 PM reminding you to study.
            </div>
          </div>
          <div
            className="w-11 h-6 rounded-full flex-shrink-0 relative transition-colors"
            style={{ background: enabled ? COL.violet : COL.track }}
          >
            <div
              className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
              style={{ left: enabled ? 22 : 2 }}
            />
          </div>
        </button>

        {(saving || saved) && (
          <div className="font-body text-[11px] mt-3" style={{ color: saved ? COL.mint : COL.sub }}>
            {saving ? "Saving…" : "Saved"}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- Your data ---------------------------------- */

function StatTile({ icon: Icon, accent, label, value, note }) {
  return (
    <div style={neu(false, 20)} className="p-4">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3" style={{ background: `${accent}22` }}>
        <Icon size={16} color={accent} />
      </div>
      <div className="font-display font-bold text-lg" style={{ color: COL.ink }}>{value}</div>
      <div className="font-body text-xs" style={{ color: COL.sub }}>{label}</div>
      {note && <div className="font-body text-[10px] mt-1" style={{ color: COL.sub, opacity: 0.75 }}>{note}</div>}
    </div>
  );
}

function YourDataPanel({ tasks, taskStats, todaySeconds, totalStudySeconds, history, dayKey, coins, streak, level, billing, myLeaderboardRank, onBack }) {
  const effectivePlan = getEffectivePlan(billing);
  const planLabel = PLAN_LABELS[effectivePlan];
  const daysRemaining = getDaysRemaining(billing);
  const planNote = effectivePlan === PLAN.FREE ? "No active subscription" : `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left`;

  // Same "this week" window Weekly Analytics uses (Mon -> today, resets
  // every Monday), so these numbers always match what's shown there.
  const thisWeek = buildWeekDays(history || {}, dayKey, todaySeconds || 0, getWeekStartKey());
  const daysSoFar = thisWeek.filter((d) => d.key <= dayKey).length || 1;
  const weeklyTotal = thisWeek.reduce((s, d) => s + d.seconds, 0);
  const dailyAverage = weeklyTotal / daysSoFar;
  const bestDay = thisWeek.reduce((best, d) => (d.seconds > (best?.seconds ?? -1) ? d : best), null);
  const bestDayLabel = bestDay && bestDay.seconds > 0 ? bestDay.date.toLocaleDateString(undefined, { weekday: "long" }) : "—";

  const rankLabel = myLeaderboardRank ? `#${myLeaderboardRank}` : "—";
  const rankNote = myLeaderboardRank ? "Resets every Monday" : "Study to get ranked";

  return (
    <div className="flex flex-col gap-5">
      <PanelHeader title="Your data" onBack={onBack} />
      <div className="grid grid-cols-2 gap-3">
        <StatTile icon={Clock} accent={COL.blue} label="Today time" value={fmtHrs(todaySeconds)} />
        <StatTile icon={Flame} accent={COL.violet} label="Total study time" value={fmtHrs(totalStudySeconds)} />
        <StatTile icon={CreditCard} accent={COL.mint} label="Plan" value={planLabel} note={planNote} />
        <StatTile icon={Coins} accent="#F5B301" label="Coins" value={fmtCompact(coins)} note="Level N pays N,000 coins" />
        <StatTile icon={Flame} accent={COL.coral} label="Streak" value={streak} />
        <StatTile icon={Shield} accent={COL.violet} label="Level" value={`Lv ${level}`} />
        <StatTile icon={Clock} accent={COL.blue} label="Weekly total" value={fmtHrs(weeklyTotal)} note="Last 7 days" />
        <StatTile icon={Clock} accent={COL.violet} label="Daily average" value={fmtHrs(dailyAverage)} note="Per day this week" />
        <StatTile icon={Flame} accent={COL.coral} label="Best day" value={fmtHrs(bestDay?.seconds || 0)} note={bestDayLabel} />
        <StatTile icon={Trophy} accent={COL.mint} label="Your rank in leaderboard" value={rankLabel} note={rankNote} />
      </div>
    </div>
  );
}

/* -------------------------------- How to use app -------------------------------- */

/* --------------------------------- Analytics -------------------------------- */

// Builds a { dayKey, date, seconds } row for every day of the fixed Mon->Sun
// calendar week that `weekStart` begins. Days after today have seconds = 0
// (they just haven't happened yet) so the week always renders as 7 bars,
// and the whole thing resets automatically the moment a new Monday starts.
function buildWeekDays(history, dayKey, todaySeconds, weekStartKey) {
  const out = [];
  const start = new Date(weekStartKey + "T00:00:00");
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const seconds = key === dayKey ? todaySeconds : (history[key] || 0);
    out.push({ key, date: d, seconds });
  }
  return out;
}

export function AnalyticsContent({ history, dayKey, todaySeconds, tasks, myLeaderboardRank }) {
  const thisWeekStart = getWeekStartKey();
  const lastWeekStart = getWeekStartKey(new Date(new Date(thisWeekStart + "T00:00:00").getTime() - 86400000));

  const thisWeek = buildWeekDays(history || {}, dayKey, todaySeconds || 0, thisWeekStart);
  const lastWeek = buildWeekDays(history || {}, dayKey, todaySeconds || 0, lastWeekStart);

  const thisWeekTotal = thisWeek.reduce((s, d) => s + d.seconds, 0);
  const lastWeekTotal = lastWeek.reduce((s, d) => s + d.seconds, 0);
  const daysSoFar = thisWeek.filter((d) => d.key <= dayKey).length || 1;
  const avgPerDay = thisWeekTotal / daysSoFar;

  const bestDay = thisWeek.reduce((best, d) => (d.seconds > (best?.seconds ?? -1) ? d : best), null);
  const bestDayLabel = bestDay && bestDay.seconds > 0 ? bestDay.date.toLocaleDateString(undefined, { weekday: "long" }) : "—";

  const weekDelta = lastWeekTotal > 0
    ? Math.round(((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100)
    : (thisWeekTotal > 0 ? 100 : 0);
  const weekDeltaLabel = `${weekDelta > 0 ? "+" : ""}${weekDelta}%`;
  const weekDeltaColor = weekDelta > 0 ? COL.mint : weekDelta < 0 ? COL.coral : COL.sub;

  const rankLabel = myLeaderboardRank ? `#${myLeaderboardRank}` : "—";
  const rankNote = myLeaderboardRank ? "Resets every Monday" : "Study to get ranked";

  const maxBar = Math.max(1, ...thisWeek.map((d) => d.seconds));

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <StatTile icon={Clock} accent={COL.blue} label="Weekly total" value={fmtHrs(thisWeekTotal)} note="Mon – today" />
        <StatTile icon={Clock} accent={COL.violet} label="Daily average" value={fmtHrs(avgPerDay)} note="Per day this week" />
        <StatTile icon={Flame} accent={COL.coral} label="Best day" value={fmtHrs(bestDay?.seconds || 0)} note={bestDayLabel} />
        <StatTile
          icon={weekDelta >= 0 ? TrendingUp : TrendingDown}
          accent={weekDeltaColor}
          label="vs last week"
          value={weekDeltaLabel}
          note={`${fmtHrs(lastWeekTotal)} last week`}
        />
        <StatTile icon={Trophy} accent={COL.mint} label="Your rank in leaderboard" value={rankLabel} note={rankNote} />
      </div>

      <div style={neu(false, 20)} className="p-4">
        <div className="font-body text-xs mb-3" style={{ color: COL.sub }}>This week (resets Monday)</div>
        <div className="flex items-end justify-between gap-2" style={{ height: 100 }}>
          {thisWeek.map((d) => {
            const h = Math.max(4, Math.round((d.seconds / maxBar) * 84));
            const isToday = d.key === dayKey;
            return (
              <div key={d.key} className="flex-1 flex flex-col items-center gap-2">
                <div
                  className="w-full rounded-lg"
                  style={{ height: h, background: isToday ? COL.violet : COL.track }}
                />
                <div className="font-body text-[10px]" style={{ color: isToday ? COL.ink : COL.sub }}>
                  {d.date.toLocaleDateString(undefined, { weekday: "narrow" })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function AnalyticsPanel({ history, dayKey, todaySeconds, tasks, myLeaderboardRank, onBack }) {
  return (
    <div className="flex flex-col gap-5">
      <PanelHeader title="Weekly Analytics" onBack={onBack} />
      <AnalyticsContent history={history} dayKey={dayKey} todaySeconds={todaySeconds} tasks={tasks} myLeaderboardRank={myLeaderboardRank} />
    </div>
  );
}

function HowToUsePanel({ onBack }) {
  const steps = [
    { title: "Start the Study Stopwatch", body: "On the Home tab, hit play on the Study Stopwatch whenever you sit down to study. It keeps running in the background even if you switch tabs, and adds straight to your \"Time today\"." },
    { title: "Reset just resets the face", body: "Tapping reset only zeroes the stopwatch's own display for a fresh session — it never removes time you've already banked for the day." },
    { title: "Add notes", body: "On the Notes tab, tap \"New note\" to jot anything down — no character limit, so a note can be as short or as long as you need." },
    { title: "Check your Calendar", body: "The Calendar tab shows how many hours you studied on each day, plus a progress chart — \"This week\" (Mon–Sun, resets every Monday) and \"This month\" (1st to today, resets on the 1st)." },
    { title: "See your stats in Your data", body: "Settings → Your data shows today's time, total study time, today's tasks, coins, streak, and level, all in one place." },
    { title: "Track progress in Weekly Analytics", body: "Settings → Weekly Analytics shows your weekly total, daily average, best day, how this week compares to last week, and your rank in the leaderboard — all measured Monday through Sunday, resetting fresh every Monday." },
    { title: "Check the Leaderboard", body: "Settings → Leaderboard (or the trophy icon on Home) ranks everyone by how much they've studied THIS WEEK. It resets every Monday, so everyone starts even — your rank updates live as you study." },
    { title: "Earn XP, coins, and streaks", body: "You earn XP for every 10 seconds you study, level up over time, and build a daily streak by opening the app and studying each day. Coins are paid out on level-up and can be spent in the Store." },
    { title: "Customize your look", body: "Buy mascots in the Store with coins, then pick your favorite as your app icon under Settings → Customize." },
    { title: "Ask AI", body: "Use \"Ask AI\" on Home to chat right inside the app — ask questions or attach a photo of your notes for an instant explanation." },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PanelHeader title="How to use Focusly" onBack={onBack} />
      <div className="flex flex-col gap-3">
        {steps.map((s, i) => (
          <div key={i} style={neu(false, 20)} className="p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-6 h-6 rounded-full flex items-center justify-center font-display font-bold text-[11px] flex-shrink-0"
                style={{ background: COL.violet, color: "#fff" }}>{i + 1}</div>
              <div className="font-display font-semibold text-sm" style={{ color: COL.ink }}>{s.title}</div>
            </div>
            <div className="font-body text-xs leading-relaxed" style={{ color: COL.sub }}>{s.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------- Billing ------------------------------------ */

function PlanBadge({ plan }) {
  const color = plan === PLAN.MAX ? COL.gold : plan === PLAN.TEAM ? COL.violet : COL.sub;
  return (
    <span
      className="font-body text-[11px] font-semibold px-2 py-1 rounded-full"
      style={{ background: `${color}22`, color }}
    >
      {PLAN_LABELS[plan]}
    </span>
  );
}

// Static reference table shown at the bottom of the panel — sourced
// directly from AI_MESSAGE_LIMITS in lib/billing.js so it can never drift
// from the actual enforced limits.
const PLAN_LIMIT_ROWS = [
  { plan: PLAN.FREE, limit: getAiMessageLimit(null) },
  { plan: PLAN.TEAM, limit: getAiMessageLimit({ plan: PLAN.TEAM, expiresAt: { toMillis: () => Date.now() + 86400000 } }) },
  { plan: PLAN.MAX, limit: getAiMessageLimit({ plan: PLAN.MAX, expiresAt: { toMillis: () => Date.now() + 86400000 } }) },
];

function BillingPanel({ uid, billing, onBack }) {
  const effectivePlan = getEffectivePlan(billing);
  const messageLimit = getAiMessageLimit(billing);
  const daysRemaining = getDaysRemaining(billing);

  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState("");
  const [redeemSuccess, setRedeemSuccess] = useState("");

  const handleRedeem = async (e) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed || redeeming) return;
    setRedeeming(true);
    setRedeemError("");
    setRedeemSuccess("");
    try {
      const { plan, days } = await redeemCode(uid, trimmed);
      setRedeemSuccess(`${PLAN_LABELS[plan]} plan activated for ${days} day${days === 1 ? "" : "s"}!`);
      setCode("");
    } catch (err) {
      setRedeemError(err.message || "Couldn't redeem that code.");
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PanelHeader title="Billing" onBack={onBack} />

      <div style={neu(false, 20)} className="p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(123,110,246,0.15)" }}>
              <CreditCard size={17} color={COL.violet} />
            </div>
            <div>
              <div className="font-display font-semibold text-sm" style={{ color: COL.ink }}>Current plan</div>
              <div className="font-body text-xs" style={{ color: COL.sub }}>
                {messageLimit === null ? "Unlimited" : `${messageLimit} min`} Ask AI / day
              </div>
            </div>
          </div>
          <PlanBadge plan={effectivePlan} />
        </div>

        {effectivePlan !== PLAN.FREE && (
          <div className="font-body text-xs" style={{ color: COL.sub }}>
            {daysRemaining > 0
              ? `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining`
              : "Expiring soon"}
          </div>
        )}
      </div>

      <div style={neu(false, 20)} className="p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Gift size={16} color={COL.gold} />
          <div className="font-display font-semibold text-sm" style={{ color: COL.ink }}>Redeem a code</div>
        </div>
        <div className="font-body text-xs" style={{ color: COL.sub }}>
          Have a Team or Max redeem code? Enter it below to activate — or extend — your plan.
        </div>

        <a
          href="http://focusly.site.je/"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            borderRadius: 12,
            background: "#FFFFFF",
            boxShadow: "8px 8px 20px rgba(0,0,0,0.55), -8px -8px 18px rgba(255,255,255,0.035)",
            color: "#15151C",
          }}
          className="py-2.5 font-body font-semibold text-sm active:scale-[0.98] transition flex items-center justify-center gap-1.5"
        >
          <ExternalLink size={14} color="#15151C" />
          Get code
        </a>

        <form onSubmit={handleRedeem} className="flex flex-col gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ENTER YOUR REEDEM CODE"
            autoCapitalize="characters"
            className="w-full px-3 py-2.5 font-body text-sm rounded-xl outline-none"
            style={{ background: COL.input, color: COL.ink }}
          />
          <button
            type="submit"
            disabled={redeeming || !code.trim()}
            style={{
              borderRadius: 12,
              background: "linear-gradient(180deg, #5AA7FF 0%, #3D8CEF 100%)",
              boxShadow: "8px 8px 20px rgba(0,0,0,0.55), -8px -8px 18px rgba(255,255,255,0.035)",
              color: "#FFFFFF",
            }}
            className="py-2.5 font-body font-semibold text-sm active:scale-[0.98] transition disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            {redeeming ? <Loader2 size={14} color="#fff" className="animate-spin" /> : <Sparkles size={14} color="#fff" />}
            {redeeming ? "Redeeming…" : "Redeem code"}
          </button>
        </form>

        {redeemError && <div className="font-body text-[11px]" style={{ color: COL.coral }}>{redeemError}</div>}
        {redeemSuccess && <div className="font-body text-[11px]" style={{ color: COL.mint }}>{redeemSuccess}</div>}
      </div>

      <div style={neu(true, 18)} className="p-4 flex flex-col gap-1.5">
        <div className="font-display font-semibold text-xs mb-1" style={{ color: COL.ink }}>Plan limits</div>
        {PLAN_LIMIT_ROWS.map(({ plan, limit }) => (
          <div key={plan} className="flex items-center justify-between font-body text-xs" style={{ color: COL.sub }}>
            <span>{PLAN_LABELS[plan]}</span>
            <span>{limit === null ? "Unlimited" : `${limit} min`} / day</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------- Change password ------------------------------- */

function ChangePasswordPanel({ user, onBack }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  const changePassword = async (e) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");
    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters.");
      return;
    }
    setPasswordBusy(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
      setPasswordSuccess("Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (e) {
      const code = e?.code || "";
      if (code.includes("wrong-password") || code.includes("invalid-credential")) {
        setPasswordError("Current password is incorrect.");
      } else {
        setPasswordError(e.message || "Couldn't change password.");
      }
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PanelHeader title="Change password" onBack={onBack} />
      <form onSubmit={changePassword} style={neu(false, 20)} className="p-4 flex flex-col gap-2.5">
        <input type="password" placeholder="Current password" value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password"
          className="w-full px-3 py-2.5 font-body text-sm rounded-xl outline-none" style={{ background: COL.input, color: COL.ink }} />
        <input type="password" placeholder="New password" value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password"
          className="w-full px-3 py-2.5 font-body text-sm rounded-xl outline-none" style={{ background: COL.input, color: COL.ink }} />
        <button type="submit" disabled={passwordBusy}
          style={{
            borderRadius: 12,
            background: "linear-gradient(180deg, #5AA7FF 0%, #3D8CEF 100%)",
            boxShadow: "8px 8px 20px rgba(0,0,0,0.55), -8px -8px 18px rgba(255,255,255,0.035)",
            color: "#FFFFFF",
          }}
          className="py-2.5 font-body font-semibold text-sm active:scale-[0.98] transition disabled:opacity-60">
          {passwordBusy ? "Updating…" : "Update password"}
        </button>
        {passwordError && <div className="font-body text-[11px]" style={{ color: COL.coral }}>{passwordError}</div>}
        {passwordSuccess && <div className="font-body text-[11px]" style={{ color: COL.mint }}>{passwordSuccess}</div>}
      </form>
    </div>
  );
}

/* ------------------------------------ main ------------------------------------ */

export default function Settings({ user, tasks, taskStats, todaySeconds, totalStudySeconds, history, dayKey, coins = 0, streak = 0, level = 1, ownedItems, activeMascot, billing, studyReminder, isMedianApp = false, initialSection = null, onLogout, myLeaderboardRank, leaderboardRows, leaderboardLoading }) {
  const [section, setSection] = useState(initialSection); // null = main menu

  if (section === "account") return <AccountSettingsPanel user={user} ownedItems={ownedItems} onBack={() => setSection(null)} />;
  if (section === "billing") return <BillingPanel uid={user.uid} billing={billing} onBack={() => setSection(null)} />;
  if (section === "customize") return <CustomizePanel uid={user.uid} ownedItems={ownedItems} activeMascot={activeMascot} onBack={() => setSection(null)} />;
  if (section === "notifications") {
    return (
      <NotificationsPanel
        uid={user.uid} studyReminder={studyReminder} isMedianApp={isMedianApp}
        onBack={() => setSection(null)}
      />
    );
  }
  if (section === "data") {
    return (
      <YourDataPanel
        tasks={tasks} taskStats={taskStats} todaySeconds={todaySeconds} totalStudySeconds={totalStudySeconds}
        history={history} dayKey={dayKey} coins={coins} streak={streak} level={level} billing={billing} myLeaderboardRank={myLeaderboardRank} onBack={() => setSection(null)}
      />
    );
  }
  if (section === "analytics") {
    return (
      <AnalyticsPanel
        history={history} dayKey={dayKey} todaySeconds={todaySeconds} tasks={tasks} myLeaderboardRank={myLeaderboardRank}
        onBack={() => setSection(null)}
      />
    );
  }
  if (section === "leaderboard") {
    return (
      <LeaderboardPanel
        rows={leaderboardRows || []} loading={!!leaderboardLoading} myUid={user.uid}
        onBack={() => setSection(null)}
      />
    );
  }
  if (section === "howto") return <HowToUsePanel onBack={() => setSection(null)} />;
  if (section === "password") return <ChangePasswordPanel user={user} onBack={() => setSection(null)} />;

  return (
    <div className="flex flex-col gap-1">
      <div className="font-display font-bold text-xl mb-2" style={{ color: COL.ink }}>Settings</div>

      <MenuRow icon={User} iconBg="rgba(90,167,255,0.15)" iconColor={COL.blue} label="Account Settings" onClick={() => setSection("account")} />
      <MenuRow icon={Palette} iconBg="rgba(245,179,1,0.15)" iconColor="#F5B301" label="Customize" onClick={() => setSection("customize")} />
      <MenuRow icon={Bell} iconBg="rgba(245,179,1,0.15)" iconColor="#F5B301" label="Notifications" onClick={() => setSection("notifications")} />

      <SectionLabel>Your account</SectionLabel>
      <MenuRow icon={Database} iconBg="rgba(123,110,246,0.15)" iconColor={COL.violet} label="Your data" onClick={() => setSection("data")} />
      <MenuRow icon={BarChart3} iconBg="rgba(90,167,255,0.15)" iconColor={COL.blue} label="Weekly Analytics" onClick={() => setSection("analytics")} />
      <MenuRow icon={Trophy} iconBg="rgba(245,179,1,0.15)" iconColor="#F5B301" label="Leaderboard" onClick={() => setSection("leaderboard")} />
      <MenuRow icon={CreditCard} iconBg="rgba(63,207,163,0.15)" iconColor={COL.mint} label="Billing" onClick={() => setSection("billing")} />

      <SectionLabel>Support</SectionLabel>
      <MenuRow icon={HelpCircle} iconBg="rgba(255,122,133,0.15)" iconColor={COL.coral} label="How to use app" onClick={() => setSection("howto")} />
      {user.hasPasswordAuth && (
        <MenuRow icon={KeyRound} iconBg="rgba(123,110,246,0.15)" iconColor={COL.violet} label="Change password" onClick={() => setSection("password")} />
      )}

      <div className="mt-2">
        <MenuRow icon={LogOut} iconBg="rgba(255,122,133,0.15)" iconColor={COL.coral} label="Log out" onClick={onLogout} />
      </div>

      <div className="font-body text-[11px] text-center mt-4" style={{ color: COL.sub, opacity: 0.7 }}>
        Email: {user.email}
      </div>
    </div>
  );
}
