// src/components/Settings.jsx
import React, { useRef, useState } from "react";
import { LogOut, Pencil, Check, Flame, ListChecks, Target, Camera, Loader2, Coins, Shield, AtSign, KeyRound, X } from "lucide-react";
import { COL, neu } from "../theme";
import { fmtHrs, fmtCompact } from "../lib/time";
import { updateUserProfile, claimUsername } from "../lib/firestore";
import { uploadProfilePhoto } from "../lib/media";
import { auth, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "../firebase";

export default function Settings({ user, tasks, totalStudySeconds, coins = 0, streak = 0, level = 1, onLogout }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.displayName || "Student");
  const [uploadingDp, setUploadingDp] = useState(false);
  const dpInputRef = useRef(null);

  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState(user.username || "");
  const [usernameBusy, setUsernameBusy] = useState(false);
  const [usernameError, setUsernameError] = useState("");

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

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
      setTimeout(() => setShowPasswordForm(false), 1200);
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

  const tasksDone = tasks.filter((t) => t.done).length;
  const goalsTotal = tasks.reduce((n, t) => n + (t.goals?.length || 0), 0);
  const goalsDone = tasks.reduce((n, t) => n + (t.goals?.filter((g) => g.done).length || 0), 0);

  const saveName = async () => {
    if (name.trim()) await updateUserProfile(user.uid, { name: name.trim() });
    setEditing(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="font-display font-semibold text-lg" style={{ color: COL.ink }}>Settings</div>

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

      <div className="grid grid-cols-2 gap-3">
        <StatTile icon={Flame} accent={COL.violet} label="Total study time" value={fmtHrs(totalStudySeconds)} />
        <StatTile icon={ListChecks} accent={COL.mint} label="Tasks completed" value={`${tasksDone}/${tasks.length}`} />
        <StatTile icon={Target} accent={COL.blue} label="Goals completed" value={`${goalsDone}/${goalsTotal}`} />
        <StatTile icon={Coins} accent="#F5B301" label="Coins" value={fmtCompact(coins)} note="Level N pays N,000 coins" />
        <StatTile icon={Flame} accent={COL.coral} label="Streak" value={streak} />
        <StatTile icon={Shield} accent={COL.violet} label="Level" value={`Lv ${level}`} />
      </div>

      {user.hasPasswordAuth && (
        <div style={neu(false, 20)} className="p-4 flex flex-col gap-3">
          <button onClick={() => setShowPasswordForm((v) => !v)} className="flex items-center gap-3 text-left">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(123,110,246,0.15)" }}>
              <KeyRound size={16} color={COL.violet} />
            </div>
            <div className="font-display font-semibold text-sm" style={{ color: COL.ink }}>Change password</div>
          </button>
          {showPasswordForm && (
            <form onSubmit={changePassword} className="flex flex-col gap-2 pt-1">
              <input type="password" placeholder="Current password" value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password"
                className="w-full px-3 py-2 font-body text-sm rounded-xl outline-none" style={{ background: COL.input, color: COL.ink }} />
              <input type="password" placeholder="New password" value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password"
                className="w-full px-3 py-2 font-body text-sm rounded-xl outline-none" style={{ background: COL.input, color: COL.ink }} />
              <button type="submit" disabled={passwordBusy} style={neu(false, 12)}
                className="py-2.5 font-body font-medium text-sm active:scale-[0.98] transition disabled:opacity-60">
                {passwordBusy ? "Updating…" : "Update password"}
              </button>
              {passwordError && <div className="font-body text-[11px]" style={{ color: COL.coral }}>{passwordError}</div>}
              {passwordSuccess && <div className="font-body text-[11px]" style={{ color: COL.mint }}>{passwordSuccess}</div>}
            </form>
          )}
        </div>
      )}

      <button onClick={onLogout} style={neu(false, 20)} className="p-4 flex items-center gap-3 active:scale-[0.98] transition text-left">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,122,133,0.15)" }}>
          <LogOut size={16} color={COL.coral} />
        </div>
        <div className="font-display font-semibold text-sm" style={{ color: COL.coral }}>Log out</div>
      </button>
    </div>
  );
}

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
