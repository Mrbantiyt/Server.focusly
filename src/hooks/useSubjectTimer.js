// src/hooks/useSubjectTimer.js
import { useEffect, useRef, useState } from "react";
import { dayKeyFor } from "../lib/time";
import { addSubjectSeconds } from "../lib/firestore";
import { playTimerCompleteChime } from "../lib/sound";

// ---------------------------------------------------------------------------
// CUSTOM (MULTI-SUBJECT) TIMER
// ---------------------------------------------------------------------------
// The user builds a list of subjects, each with its own minutes (e.g.
// Math = 15, Hindi = 15). Pressing Start counts down the FIRST subject.
// When a subject's time reaches 0:
//   - its seconds are credited to that subject's "today" total (Firestore,
//     see addSubjectSeconds)
//   - a short chime plays (~5s of the same completion sound, looped)
//   - the timer AUTO-CONTINUES straight into the next subject in the list
//     — it never resets and never pauses waiting for the user
// When the LAST subject finishes, the same chime plays again to mark the
// whole session as complete, and the timer stops (finished = true) instead
// of continuing.
//
// Elapsed seconds are also reported back tick-by-tick via onTickSecond, so
// the caller (App.jsx) can fold them into the existing Study Timer's
// "Time today" total too — this timer's time counts toward BOTH the
// per-subject total AND the overall daily total, per spec.
//
// Persistence follows the same localStorage-mirror pattern as
// useCountdownTimer, so a background/reload doesn't lose progress or
// silently reset the running plan.
const STORAGE_KEY_PREFIX = "focusly:subjectTimerState:";
const COMPLETE_CHIME_MS = 5000; // "5 sec sound" between-subject / final chime

function loadPersistedState(uid) {
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + uid);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.dayKey !== dayKeyFor(new Date())) return null; // fresh day, fresh plan
    return parsed;
  } catch {
    return null;
  }
}

function persistState(uid, state) {
  if (!uid) return;
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + uid, JSON.stringify(state));
  } catch {
    // non-fatal — same tradeoff as useCountdownTimer
  }
}

// plan: [{ id, name, totalSeconds }, ...]
export function useSubjectTimer(uid, { onElapsedSecond } = {}) {
  const persisted = loadPersistedState(uid);

  const [dayKey, setDayKey] = useState(persisted?.dayKey || dayKeyFor(new Date()));
  const [plan, setPlan] = useState(persisted?.plan || []); // [{ id, name, totalSeconds }]
  const [activeIndex, setActiveIndex] = useState(persisted?.activeIndex ?? 0);
  const [remaining, setRemaining] = useState(persisted?.remaining ?? 0);
  const [running, setRunning] = useState(persisted?.running || false);
  const [finished, setFinished] = useState(false); // whole plan complete
  const [chiming, setChiming] = useState(false); // true for ~5s while the transition/completion sound plays

  const planRef = useRef(persisted?.plan || []);
  const activeIndexRef = useRef(persisted?.activeIndex ?? 0);
  const remainingRef = useRef(persisted?.remaining ?? 0);
  const runningRef = useRef(persisted?.running || false);
  const chimeTimeoutRef = useRef(null);
  const chimeIntervalRef = useRef(null);

  useEffect(() => { runningRef.current = running; }, [running]);

  const persistNow = () => {
    persistState(uid, {
      dayKey,
      plan: planRef.current,
      activeIndex: activeIndexRef.current,
      remaining: remainingRef.current,
      running: runningRef.current,
    });
  };

  const stopChime = () => {
    if (chimeTimeoutRef.current) { clearTimeout(chimeTimeoutRef.current); chimeTimeoutRef.current = null; }
    if (chimeIntervalRef.current) { clearInterval(chimeIntervalRef.current); chimeIntervalRef.current = null; }
    setChiming(false);
  };

  // Plays the completion chime on a short loop for ~5 seconds, then stops
  // on its own — used both for a between-subject transition and for the
  // final "whole plan done" moment.
  const playFiveSecondChime = () => {
    stopChime();
    setChiming(true);
    playTimerCompleteChime();
    chimeIntervalRef.current = setInterval(playTimerCompleteChime, 1800);
    chimeTimeoutRef.current = setTimeout(stopChime, COMPLETE_CHIME_MS);
  };

  useEffect(() => stopChime, []); // clear any pending chime timers on unmount

  // Sets a brand-new plan (only while stopped) — replaces whatever was
  // there before, always starting at subject 0.
  const setSubjectPlan = (subjects) => {
    if (runningRef.current) return;
    const cleaned = subjects
      .filter((s) => s.name && s.name.trim() && s.totalSeconds > 0)
      .map((s) => ({ id: s.id, name: s.name.trim(), totalSeconds: Math.floor(s.totalSeconds) }));
    planRef.current = cleaned;
    setPlan(cleaned);
    activeIndexRef.current = 0;
    setActiveIndex(0);
    const firstRemaining = cleaned[0]?.totalSeconds ?? 0;
    remainingRef.current = firstRemaining;
    setRemaining(firstRemaining);
    setFinished(false);
    stopChime();
    persistState(uid, { dayKey, plan: cleaned, activeIndex: 0, remaining: firstRemaining, running: false });
  };

  const start = () => {
    if (!planRef.current.length) return;
    if (remainingRef.current <= 0) return;
    setFinished(false);
    runningRef.current = true;
    setRunning(true);
    persistNow();
  };

  const pause = () => {
    runningRef.current = false;
    setRunning(false);
    persistNow();
  };

  const toggle = () => (runningRef.current ? pause() : start());

  // Resets the whole plan back to subject 0 at full durations (does not
  // touch anything already credited to Firestore).
  const reset = () => {
    runningRef.current = false;
    setRunning(false);
    activeIndexRef.current = 0;
    setActiveIndex(0);
    const firstRemaining = planRef.current[0]?.totalSeconds ?? 0;
    remainingRef.current = firstRemaining;
    setRemaining(firstRemaining);
    setFinished(false);
    stopChime();
    persistNow();
  };

  // Clears the plan entirely (e.g. user closes the Custom Timer card).
  const clearPlan = () => {
    runningRef.current = false;
    setRunning(false);
    planRef.current = [];
    setPlan([]);
    activeIndexRef.current = 0;
    setActiveIndex(0);
    remainingRef.current = 0;
    setRemaining(0);
    setFinished(false);
    stopChime();
    persistState(uid, { dayKey, plan: [], activeIndex: 0, remaining: 0, running: false });
  };

  // The 1-second countdown tick.
  useEffect(() => {
    const id = setInterval(() => {
      const key = dayKeyFor(new Date());
      if (key !== dayKey) { setDayKey(key); return; }

      if (!runningRef.current) return;
      if (!planRef.current.length) return;
      if (remainingRef.current <= 0) return;

      remainingRef.current -= 1;
      setRemaining(remainingRef.current);

      // Credit this elapsed second to the ACTIVE subject's daily total,
      // and (per spec) to the overall "Time today" total too.
      const activeSubject = planRef.current[activeIndexRef.current];
      if (activeSubject && uid) {
        addSubjectSeconds(uid, key, activeSubject.name, 1).catch((err) => {
          console.warn("[subjectTimer] Failed to credit subject second:", err);
        });
      }
      onElapsedSecond?.(1);

      if (remainingRef.current <= 0) {
        const isLastSubject = activeIndexRef.current >= planRef.current.length - 1;
        if (isLastSubject) {
          // Whole plan complete — stop and chime, do NOT auto-reset.
          runningRef.current = false;
          setRunning(false);
          setFinished(true);
          playFiveSecondChime();
        } else {
          // Auto-continue straight into the next subject.
          playFiveSecondChime();
          activeIndexRef.current += 1;
          setActiveIndex(activeIndexRef.current);
          const nextRemaining = planRef.current[activeIndexRef.current]?.totalSeconds ?? 0;
          remainingRef.current = nextRemaining;
          setRemaining(nextRemaining);
        }
      }

      persistState(uid, {
        dayKey: key,
        plan: planRef.current,
        activeIndex: activeIndexRef.current,
        remaining: remainingRef.current,
        running: runningRef.current,
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 1000);
    return () => clearInterval(id);
  }, [dayKey, uid]);

  const activeSubject = plan[activeIndex] || null;
  const totalPlanSeconds = plan.reduce((sum, s) => sum + s.totalSeconds, 0);
  const elapsedPlanSeconds =
    plan.slice(0, activeIndex).reduce((sum, s) => sum + s.totalSeconds, 0) +
    ((activeSubject?.totalSeconds ?? 0) - remaining);

  return {
    plan,
    activeIndex,
    activeSubject,      // { id, name, totalSeconds } | null
    remaining,           // seconds left on the ACTIVE subject
    running,
    finished,             // true once the whole plan has completed
    chiming,              // true for ~5s during a transition/completion chime
    totalPlanSeconds,
    elapsedPlanSeconds,
    setSubjectPlan,
    start,
    pause,
    toggle,
    reset,
    clearPlan,
    dayKey,
  };
}
