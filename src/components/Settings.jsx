// src/components/Settings.jsx
//
// Redesigned as a menu list (matching the reference screenshots) instead of
// one long scrolling page. Tapping a row opens that section as a full-panel
// overlay with a back button, then returns to the same menu.
import React, { useRef, useState } from "react";
import {
  ChevronLeft, ChevronRight, LogOut, Pencil, Check, Flame, ListChecks, Target,
  Camera, Loader2, Coins, Shield, AtSign, KeyRound, X, User, Palette, Bell,
  Database, HelpCircle, Clock,
} from "lucide-react";
import { COL, neu } from "../theme";
import { fmtHrs, fmtCompact } from "../lib/time";
import { updateUserProfile, claimUsername, setActiveMascot } from "../lib/firestore";
import { uploadProfilePhoto } from "../lib/media";
import { auth, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "../firebase";
import { STORE_ITEMS } from "./Store";

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

function AccountSettingsPanel({ user, onBack }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.displayName || "Student");
  const [uploadingDp, setUploadingDp] = useState(false);
  const dpInputRef = useRef(null);

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
      await claimUsername(user.uid, trimmed);
      setEditingUsername(false);
    } catch (e) {
      setUsernameError(e.message || "Couldn't update username.");
    } finally {
      setUsernameBusy(false);
    }
  };

  const pickDp = () => dpInputRef.current?.click();

  const onDpChosen = async (file) => {
    if (!file) return;
    setUploadingDp(true);
    try {
      const photoURL = await uploadProfilePhoto(file);
      await updateUserProfile(user.uid, { photoURL });
    } catch (e) {
      alert("Couldn't update profile picture: " + e.message);
    } finally {
      setUploadingDp(false);
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
          <input ref={dpInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => onDpChosen(e.target.files?.[0])} />
          <button onClick={pickDp} disabled={uploadingDp}
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center border-2"
            style={{ background: COL.violet, borderColor: COL.card }}>
            {uploadingDp ? <Loader2 size={12} color="#fff" className="animate-spin" /> : <Camera size={12} color="#fff" />}
          </button>
        </div>

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
        <div style={neu(true, 20)} className="p-5 text-center font-body text-xs" style={{ color: COL.sub }}>
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

function NotificationsPanel({ onBack }) {
  return (
    <div className="flex flex-col gap-5">
      <PanelHeader title="Notifications" onBack={onBack} />
      <div style={neu(true, 20)} className="p-6 text-center flex flex-col items-center gap-2">
        <Bell size={28} color={COL.sub} />
        <div className="font-display font-semibold text-sm" style={{ color: COL.ink }}>Coming soon</div>
        <div className="font-body text-xs" style={{ color: COL.sub }}>
          Notification settings aren't set up yet — check back in a future update.
        </div>
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

function YourDataPanel({ tasks, todaySeconds, totalStudySeconds, coins, streak, level, onBack }) {
  const tasksDone = tasks.filter((t) => t.done).length;
  const goalsTotal = tasks.reduce((n, t) => n + (t.goals?.length || 0), 0);
  const goalsDone = tasks.reduce((n, t) => n + (t.goals?.filter((g) => g.done).length || 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <PanelHeader title="Your data" onBack={onBack} />
      <div className="grid grid-cols-2 gap-3">
        <StatTile icon={Clock} accent={COL.blue} label="Today time" value={fmtHrs(todaySeconds)} />
        <StatTile icon={Flame} accent={COL.violet} label="Total study time" value={fmtHrs(totalStudySeconds)} />
        <StatTile icon={ListChecks} accent={COL.mint} label="Tasks completed" value={`${tasksDone}/${tasks.length}`} />
        <StatTile icon={Target} accent={COL.blue} label="Goals completed" value={`${goalsDone}/${goalsTotal}`} />
        <StatTile icon={Coins} accent="#F5B301" label="Coins" value={fmtCompact(coins)} note="Level N pays N,000 coins" />
        <StatTile icon={Flame} accent={COL.coral} label="Streak" value={streak} />
        <StatTile icon={Shield} accent={COL.violet} label="Level" value={`Lv ${level}`} />
      </div>
    </div>
  );
}

/* -------------------------------- How to use app -------------------------------- */

function HowToUsePanel({ onBack }) {
  const steps = [
    { title: "Start the Study Stopwatch", body: "On the Home tab, hit play on the Study Stopwatch whenever you sit down to study. It keeps running in the background even if you switch tabs, and adds straight to your \"Time today\"." },
    { title: "Reset just resets the face", body: "Tapping reset only zeroes the stopwatch's own display for a fresh session — it never removes time you've already banked for the day." },
    { title: "Add tasks and goals", body: "On the Tasks tab, add what you're working on. Tasks with goals auto-complete once every goal is checked off; simple tasks can be marked done manually." },
    { title: "Run a task's own timer", body: "Each task has its own play/pause timer so you can track how long you spend on that specific task, separate from the main stopwatch." },
    { title: "Check your Calendar", body: "The Calendar tab shows how many hours you studied on each day, plus a 7-day / 1-month progress chart." },
    { title: "Earn XP, coins, and streaks", body: "You earn XP for every 10 seconds you study, level up over time, and build a daily streak by opening the app and studying each day. Coins are paid out on level-up and can be spent in the Store." },
    { title: "Customize your look", body: "Buy mascots in the Store with coins, then pick your favorite as your app icon under Settings → Customize." },
    { title: "Ask AI", body: "Use \"Ask AI\" on Home for quick help — it links out to Gemini for notes and Google for search." },
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

export default function Settings({ user, tasks, todaySeconds, totalStudySeconds, coins = 0, streak = 0, level = 1, ownedItems, activeMascot, onLogout }) {
  const [section, setSection] = useState(null); // null = main menu

  if (section === "account") return <AccountSettingsPanel user={user} onBack={() => setSection(null)} />;
  if (section === "customize") return <CustomizePanel uid={user.uid} ownedItems={ownedItems} activeMascot={activeMascot} onBack={() => setSection(null)} />;
  if (section === "notifications") return <NotificationsPanel onBack={() => setSection(null)} />;
  if (section === "data") {
    return (
      <YourDataPanel
        tasks={tasks} todaySeconds={todaySeconds} totalStudySeconds={totalStudySeconds}
        coins={coins} streak={streak} level={level} onBack={() => setSection(null)}
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
