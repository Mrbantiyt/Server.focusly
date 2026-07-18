// src/components/SubjectTimerCard.jsx
import React, { useState } from "react";
import { Play, Pause, RotateCcw, Plus, X, ListPlus, BookOpen } from "lucide-react";
import { COL, neu } from "../theme";
import { fmtHMS } from "../lib/time";

// Compact "1h 30m" / "45m" style label for a whole-minutes duration —
// used in the draft-subject chips and the saved-plan pills.
function fmtMinutesLabel(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

// The "Custom Timer" card — sits directly below the Study Timer card.
// Lets the user build a list of subjects each with its own minutes, then
// runs them back-to-back: when one subject's time is up, a short chime
// plays and the next subject starts automatically (no reset, no pause).
// When the whole list finishes, a final chime marks the full session done.
export function SubjectTimerCard({
  plan, activeIndex, activeSubject, remaining, running, finished, chiming,
  totalPlanSeconds, elapsedPlanSeconds,
  onSetPlan, onStart, onPause, onReset, onClearPlan,
  saveError,
}) {
  const [open, setOpen] = useState(plan.length > 0);
  const [draftName, setDraftName] = useState("");
  const [draftHours, setDraftHours] = useState("");
  const [draftMinutes, setDraftMinutes] = useState("");
  const [draftSubjects, setDraftSubjects] = useState(
    plan.length ? plan.map((s) => ({ name: s.name, minutes: Math.round(s.totalSeconds / 60) })) : []
  );

  const hasPlan = plan.length > 0;
  const isBuilding = open && !hasPlan;

  const addDraftSubject = () => {
    const name = draftName.trim();
    const hours = Math.max(0, parseInt(draftHours, 10) || 0);
    const mins = Math.max(0, parseInt(draftMinutes, 10) || 0);
    const minutes = hours * 60 + mins;
    if (!name || minutes <= 0) return;
    setDraftSubjects((prev) => [...prev, { name, minutes }]);
    setDraftName("");
    setDraftHours("");
    setDraftMinutes("");
  };

  const removeDraftSubject = (idx) => {
    setDraftSubjects((prev) => prev.filter((_, i) => i !== idx));
  };

  const confirmPlan = () => {
    if (!draftSubjects.length) return;
    onSetPlan(draftSubjects.map((s, i) => ({ id: `${Date.now()}-${i}`, name: s.name, totalSeconds: s.minutes * 60 })));
  };

  const handleReset = () => {
    if (!finished && !window.confirm("Reset the custom timer back to the start of your subject list?")) return;
    onReset();
  };

  const handleClear = () => {
    if (running && !window.confirm("Stop and clear your custom timer subjects?")) return;
    onClearPlan();
    setDraftSubjects([]);
    setOpen(false);
  };

  const totalProgress = totalPlanSeconds > 0 ? Math.min(elapsedPlanSeconds / totalPlanSeconds, 1) : 0;

  return (
    <div
      style={{
        ...neu(false, 28),
        background: `radial-gradient(circle at 30% 20%, rgba(63,207,163,0.12), ${COL.card} 65%)`,
        border: `1px solid ${COL.border}`,
      }}
      className="p-6 flex flex-col"
    >
      <div className="w-full flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <ListPlus size={16} color={COL.mint} />
          <span className="font-display font-semibold text-sm" style={{ color: COL.ink }}>Custom Timer</span>
        </div>
        {hasPlan && (
          <button type="button" onClick={handleClear} className="font-body text-[11px]" style={{ color: COL.sub }}>
            Clear
          </button>
        )}
      </div>
      <span className="font-body text-xs mb-4" style={{ color: COL.sub }}>
        Add your own subjects, each with its own time — they'll run one after another.
      </span>

      {saveError && (
        <div
          className="mb-4 px-3 py-2 rounded-xl font-body text-xs"
          style={{ background: "rgba(255,90,90,0.12)", color: COL.coral, border: `1px solid rgba(255,90,90,0.3)` }}
        >
          ⚠️ {saveError} It'll keep retrying — check your internet, or that you're still signed in.
        </div>
      )}

      {/* Collapsed state: nothing built yet */}
      {!open && !hasPlan && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center justify-center gap-2 py-3 rounded-2xl active:scale-[0.98] transition"
          style={{ background: `linear-gradient(100deg, ${COL.mint}, ${COL.blue})` }}
        >
          <Plus size={16} color="#0B0B10" />
          <span className="font-display font-semibold text-sm" style={{ color: "#0B0B10" }}>Build Custom Timer</span>
        </button>
      )}

      {/* Builder: adding subjects before starting */}
      {isBuilding && (
        <>
          <div className="flex flex-col gap-2 mb-3">
            {draftSubjects.map((s, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-xl" style={neu(true, 14)}>
                <span className="font-body text-sm" style={{ color: COL.ink }}>{s.name}</span>
                <div className="flex items-center gap-2">
                  <span className="font-body text-xs" style={{ color: COL.sub }}>{fmtMinutesLabel(s.minutes)}</span>
                  <button type="button" onClick={() => removeDraftSubject(i)}>
                    <X size={14} color={COL.coral} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 mb-3">
            <input
              type="text"
              placeholder="Subject (e.g. Math)"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              style={{ ...neu(true, 12), color: COL.ink, padding: "10px 12px", border: `1px solid ${COL.border}`, flex: 1, minWidth: 0 }}
              className="font-body text-sm"
            />
          </div>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex flex-col items-center gap-1">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                max="23"
                placeholder="0"
                value={draftHours}
                onChange={(e) => setDraftHours(e.target.value)}
                style={{ ...neu(true, 12), color: COL.ink, padding: "10px 0", border: `1px solid ${COL.border}`, width: 56, textAlign: "center" }}
                className="font-body text-sm"
              />
              <span className="font-body text-[10px] uppercase" style={{ color: COL.sub }}>hrs</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                max="59"
                placeholder="0"
                value={draftMinutes}
                onChange={(e) => setDraftMinutes(e.target.value)}
                style={{ ...neu(true, 12), color: COL.ink, padding: "10px 0", border: `1px solid ${COL.border}`, width: 56, textAlign: "center" }}
                className="font-body text-sm"
              />
              <span className="font-body text-[10px] uppercase" style={{ color: COL.sub }}>min</span>
            </div>
            <button
              type="button"
              onClick={addDraftSubject}
              className="flex items-center justify-center gap-1.5 h-11 px-4 rounded-xl active:scale-95 transition shrink-0 self-end"
              style={{ background: `linear-gradient(100deg, ${COL.mint}, ${COL.blue})` }}
            >
              <Plus size={16} color="#0B0B10" />
              <span className="font-display font-semibold text-sm" style={{ color: "#0B0B10" }}>Add</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setOpen(false); setDraftSubjects([]); }}
              className="flex-1 py-2.5 rounded-xl font-body text-sm active:scale-[0.98] transition"
              style={{ ...neu(false, 12), color: COL.sub }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmPlan}
              disabled={!draftSubjects.length}
              className="flex-1 py-2.5 rounded-xl font-display font-semibold text-sm active:scale-[0.98] transition disabled:opacity-40"
              style={{ background: `linear-gradient(100deg, ${COL.mint}, ${COL.blue})`, color: "#0B0B10" }}
            >
              Save plan ({fmtMinutesLabel(draftSubjects.reduce((s, x) => s + x.minutes, 0))} total)
            </button>
          </div>
        </>
      )}

      {/* Active plan: running/paused/finished */}
      {hasPlan && (
        <>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {plan.map((s, i) => (
              <div
                key={s.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-body text-xs"
                style={{
                  background: i === activeIndex ? "rgba(63,207,163,0.16)" : i < activeIndex ? "rgba(140,140,161,0.1)" : COL.track,
                  color: i === activeIndex ? COL.mint : i < activeIndex ? COL.sub : COL.sub,
                  border: i === activeIndex ? `1px solid ${COL.mint}` : "1px solid transparent",
                }}
              >
                <BookOpen size={11} />
                {s.name} · {fmtMinutesLabel(Math.round(s.totalSeconds / 60))}
                {i < activeIndex && " ✓"}
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center">
            <span
              className="font-bold text-3xl tracking-wide"
              style={{ color: finished ? COL.gold : COL.ink, fontFamily: "'JetBrains Mono', monospace" }}
            >
              {fmtHMS(remaining)}
            </span>
            <span className="font-body text-[11px] uppercase tracking-wider mt-1" style={{ color: COL.sub }}>
              {finished ? "all subjects complete! 🎉" : chiming ? "up next…" : activeSubject ? `studying ${activeSubject.name}` : ""}
            </span>

            {/* overall plan progress bar */}
            <div className="w-full mt-3" style={{ height: 6, borderRadius: 999, background: COL.track, overflow: "hidden" }}>
              <div
                style={{
                  width: `${Math.round(totalProgress * 100)}%`,
                  height: "100%",
                  background: `linear-gradient(90deg, ${COL.mint}, ${COL.blue})`,
                  transition: "width 1s linear",
                }}
              />
            </div>
            <span className="font-body text-[10px] mt-1" style={{ color: COL.sub }}>
              {fmtHMS(elapsedPlanSeconds)} / {fmtHMS(totalPlanSeconds)} total
            </span>
          </div>

          <div className="flex items-center justify-center gap-3 mt-5">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center justify-center w-11 h-11 rounded-full active:scale-95 transition"
              style={finished
                ? { background: `linear-gradient(100deg, ${COL.coral}, ${COL.gold})`, boxShadow: "0 0 0 4px rgba(255,182,72,0.25)", animation: "focusly-pulse-subject 1s ease-in-out infinite" }
                : neu(false, 999)}
            >
              <RotateCcw size={16} color={finished ? "#fff" : COL.sub} />
            </button>
            <button
              type="button"
              onClick={running ? onPause : onStart}
              disabled={!running && (finished || remaining <= 0)}
              className="flex items-center justify-center w-16 h-11 rounded-full active:scale-95 transition disabled:opacity-40"
              style={{ background: `linear-gradient(100deg, ${COL.mint}, ${COL.blue})`, boxShadow: "0 10px 24px rgba(63,207,163,0.35)" }}
            >
              {running ? <Pause size={18} color="#0B0B10" /> : <Play size={18} color="#0B0B10" />}
            </button>
            <div className="w-11 h-11" />
          </div>
          {finished && (
            <>
              <span className="font-body text-[11px] mt-3 text-center" style={{ color: COL.gold }}>
                Tap reset to run this subject list again
              </span>
              <style>{`@keyframes focusly-pulse-subject { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }`}</style>
            </>
          )}
        </>
      )}
    </div>
  );
}
