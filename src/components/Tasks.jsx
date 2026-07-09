// src/components/Tasks.jsx
import React, { useRef, useState } from "react";
import { Plus, Play, Pause, Check, Trash2, ChevronDown, ChevronUp, Camera, Loader2, ImageOff, Clock } from "lucide-react";
import { COL, neu } from "../theme";
import { fmtHMS } from "../lib/time";
import { addTask, updateTask, deleteTask, addGoal, setGoalDone, removeGoal } from "../lib/firestore";
import { uploadProofPhoto, mediaSrc } from "../lib/media";

const TAG_COLOR = { High: COL.coral, Medium: COL.blue, Low: COL.mint };

// `tasks` is passed down from App.jsx (via the useTasks hook), which keeps
// ticking a running task's elapsed time even while this tab isn't open —
// see src/hooks/useTasks.js for why that used to break.
export default function Tasks({ uid, tasks }) {
  const [draft, setDraft] = useState("");
  const [openId, setOpenId] = useState(null);

  // `t.elapsed` here is already the LIVE value (see useTasks.js's liveTasks
  // mapping) — it already includes time elapsed since `startedAt`. So on
  // pause we just bank it as-is; we must NOT add (Date.now() - startedAt)
  // again on top, or the current run gets counted twice.
  const toggleRun = (t) => {
    if (t.running) {
      const finalElapsed = Math.floor(t.elapsed || 0);
      updateTask(uid, t.id, { running: false, startedAt: null, elapsed: finalElapsed });
    } else {
      updateTask(uid, t.id, { running: true, startedAt: Date.now() });
    }
  };
  const toggleManualDone = (t) => {
    // only used for tasks with no goals — goal-based tasks auto-complete
    if ((t.goals || []).length > 0) return;
    const finalElapsed = Math.floor(t.elapsed || 0);
    updateTask(uid, t.id, { done: !t.done, running: false, startedAt: null, elapsed: finalElapsed });
  };
  const remove = (id) => {
    const task = tasks.find((t) => t.id === id);
    deleteTask(uid, id, task);
  };
  const add = () => {
    if (!draft.trim()) return;
    addTask(uid, draft.trim());
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="font-display font-semibold text-lg" style={{ color: COL.ink }}>Daily tasks</div>
      <div style={neu(true, 18)} className="flex items-center gap-2 px-3 py-2.5">
        <Plus size={16} color={COL.sub} />
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add a task…" className="flex-1 bg-transparent outline-none font-body text-sm" style={{ color: COL.ink }} />
      </div>
      <div className="flex flex-col gap-3">
        {tasks.map((t) => (
          <TaskCard
            key={t.id}
            uid={uid}
            task={t}
            open={openId === t.id}
            onToggleOpen={() => setOpenId((id) => (id === t.id ? null : t.id))}
            onToggleRun={() => toggleRun(t)}
            onToggleManualDone={() => toggleManualDone(t)}
            onRemove={() => remove(t.id)}
          />
        ))}
        {tasks.length === 0 && (
          <div className="font-body text-sm text-center py-6" style={{ color: COL.sub }}>No tasks yet — add one above.</div>
        )}
      </div>
    </div>
  );
}

function TaskCard({ uid, task: t, open, onToggleOpen, onToggleRun, onToggleManualDone, onRemove }) {
  const goals = t.goals || [];
  const hasGoals = goals.length > 0;
  const doneCount = goals.filter((g) => g.done).length;

  return (
    <div style={neu(false, 18)} className="p-3.5 flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <button onClick={onToggleRun} disabled={t.done}
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: t.running ? COL.violet : COL.track, opacity: t.done ? 0.4 : 1 }}>
          {t.running ? <Pause size={13} color="#fff" /> : <Play size={13} color={COL.sub} />}
        </button>

        <button className="flex-1 text-left" onClick={onToggleOpen}>
          <div className="font-body text-sm" style={{ color: COL.ink, textDecoration: t.done ? "line-through" : "none", opacity: t.done ? 0.5 : 1 }}>
            {t.title}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-body text-[11px] px-2 py-0.5 rounded-full" style={{ background: `${TAG_COLOR[t.tag] || COL.blue}1f`, color: TAG_COLOR[t.tag] || COL.blue }}>{t.tag}</span>
            <span className="font-body text-[11px]" style={{ color: COL.sub }}>{fmtHMS(t.elapsed)}</span>
            {hasGoals && (
              <span className="font-body text-[11px]" style={{ color: COL.violet }}>{doneCount}/{goals.length} goals</span>
            )}
          </div>
        </button>

        {!hasGoals && (
          <button onClick={onToggleManualDone}
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ border: `2px solid ${t.done ? COL.mint : COL.border}`, background: t.done ? COL.mint : "transparent" }}>
            {t.done && <Check size={13} color="#fff" />}
          </button>
        )}
        {hasGoals && t.done && (
          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: COL.mint }}>
            <Check size={13} color="#fff" />
          </div>
        )}

        <button onClick={onToggleOpen}>
          {open ? <ChevronUp size={16} color={COL.sub} /> : <ChevronDown size={16} color={COL.sub} />}
        </button>
        <button onClick={onRemove}><Trash2 size={15} color={COL.sub} /></button>
      </div>

      {open && (
        <div className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: "rgba(163,170,199,0.25)" }}>
          {/* watch icon: how long this task has run, and whether it's currently ticking */}
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-1.5">
              <Clock size={13} color={t.running ? COL.violet : COL.sub} />
              <span className="font-body text-xs font-semibold" style={{ color: t.running ? COL.violet : COL.ink }}>{fmtHMS(t.elapsed)}</span>
              <span className="font-body text-[10px]" style={{ color: COL.sub }}>{t.running ? "running" : "paused"}</span>
            </div>
            {/* completion status */}
            <span className="font-body text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: t.done ? `${COL.mint}22` : `${COL.coral}1f`, color: t.done ? COL.mint : COL.coral }}>
              {t.done ? "Complete" : "Not complete"}
            </span>
          </div>
          <GoalsPanel uid={uid} task={t} goals={goals} />
        </div>
      )}
    </div>
  );
}

function GoalsPanel({ uid, task, goals }) {
  const [draft, setDraft] = useState("");
  const [busyId, setBusyId] = useState(null);
  const fileInputs = useRef({});

  const add = () => {
    if (!draft.trim()) return;
    addGoal(uid, task.id, goals, draft.trim());
    setDraft("");
  };

  const pickPhoto = (goalId) => fileInputs.current[goalId]?.click();

  const onPhotoChosen = async (goalId, file) => {
    if (!file) return;
    setBusyId(goalId);
    try {
      const path = await uploadProofPhoto(file, `Goal proof — ${task.title}`);
      await setGoalDone(uid, task.id, goals, goalId, true, path, {
        elapsed: task.elapsed,
        running: task.running,
        startedAt: task.startedAt,
      });
    } catch (e) {
      alert("Upload failed: " + e.message);
    } finally {
      setBusyId(null);
    }
  };

  const undo = (goalId) => setGoalDone(uid, task.id, goals, goalId, false, null);
  const remove = (goalId) => removeGoal(uid, task.id, goals, goalId);

  return (
    <div className="flex flex-col gap-3 pt-1">
      {goals.map((g) => (
        <div key={g.id} className="flex items-start gap-2 pl-2">
          <div className="flex-1">
            <div className="font-body text-xs" style={{ color: COL.ink, textDecoration: g.done ? "line-through" : "none", opacity: g.done ? 0.6 : 1 }}>
              {g.text}
            </div>
            {/* full-size media preview so it's clear which photo was uploaded as proof */}
            {g.done && g.photoPath && (
              <img src={mediaSrc(g.photoPath)} alt="proof" className="mt-1.5 w-full max-h-48 rounded-xl object-cover" />
            )}
            {g.done && !g.photoPath && (
              <div className="flex items-center gap-1 mt-1 font-body text-[10px]" style={{ color: COL.sub }}>
                <ImageOff size={10} /> no proof photo
              </div>
            )}
          </div>

          <input
            ref={(el) => (fileInputs.current[g.id] = el)}
            type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => onPhotoChosen(g.id, e.target.files?.[0])}
          />

          {g.done ? (
            <button onClick={() => undo(g.id)}
              className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: COL.mint }}>
              <Check size={12} color="#fff" />
            </button>
          ) : busyId === g.id ? (
            <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
              <Loader2 size={14} color={COL.violet} className="animate-spin" />
            </div>
          ) : (
            <button onClick={() => pickPhoto(g.id)}
              className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ border: `2px solid ${COL.border}` }}>
              <Camera size={11} color={COL.sub} />
            </button>
          )}
          <button onClick={() => remove(g.id)}><Trash2 size={13} color={COL.sub} /></button>
        </div>
      ))}

      <div className="flex items-center gap-2 pl-2 pt-1">
        <Plus size={13} color={COL.sub} />
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add a goal…" className="flex-1 bg-transparent outline-none font-body text-xs" style={{ color: COL.ink }} />
      </div>
      {goals.length === 0 && (
        <div className="font-body text-[11px] pl-2" style={{ color: COL.sub }}>
          Add goals to this task — upload a photo for each to complete it. Once every goal is done, the task completes itself.
        </div>
      )}
    </div>
  );
}
