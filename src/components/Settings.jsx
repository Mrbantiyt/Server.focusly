// src/components/Settings.jsx
import React, { useRef, useState } from "react";
import { LogOut, Pencil, Check, Flame, ListChecks, Target, Camera, Loader2 } from "lucide-react";
import { COL, neu } from "../theme";
import { fmtHrs } from "../lib/time";
import { updateUserProfile } from "../lib/firestore";
import { uploadProfilePhoto } from "../lib/media";

export default function Settings({ user, tasks, totalStudySeconds, onLogout }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.displayName || "Student");
  const [uploadingDp, setUploadingDp] = useState(false);
  const dpInputRef = useRef(null);

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
              className="font-body text-sm px-2 py-1 rounded-lg outline-none text-center" style={{ background: "#fff", color: COL.ink }} />
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
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatTile icon={Flame} accent={COL.violet} label="Total study time" value={fmtHrs(totalStudySeconds)} />
        <StatTile icon={ListChecks} accent={COL.mint} label="Tasks completed" value={`${tasksDone}/${tasks.length}`} />
        <StatTile icon={Target} accent={COL.blue} label="Goals completed" value={`${goalsDone}/${goalsTotal}`} />
      </div>

      <button onClick={onLogout} style={neu(false, 20)} className="p-4 flex items-center gap-3 active:scale-[0.98] transition text-left">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,122,133,0.15)" }}>
          <LogOut size={16} color={COL.coral} />
        </div>
        <div className="font-display font-semibold text-sm" style={{ color: COL.coral }}>Log out</div>
      </button>
    </div>
  );
}

function StatTile({ icon: Icon, accent, label, value }) {
  return (
    <div style={neu(false, 20)} className="p-4">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3" style={{ background: `${accent}22` }}>
        <Icon size={16} color={accent} />
      </div>
      <div className="font-display font-bold text-lg" style={{ color: COL.ink }}>{value}</div>
      <div className="font-body text-xs" style={{ color: COL.sub }}>{label}</div>
    </div>
  );
}
