// src/hooks/useSubjectTimer.js
import { useEffect, useRef, useState } from "react";
import { dayKeyFor } from "../lib/time";
import { playTimerCompleteChime } from "../lib/sound";
import { addSubjectSeconds, addSubjectSecondsForDay } from "../lib/firestore";
import { scheduleTimerNotification, cancelTimerNotification } from "../lib/timerNotifications";

// ---------------------------------------------------------------------------
// CUSTOM (MULTI-SUBJECT) TIMER
// ---------------------------------------------------------------------------
// The user builds a list of subjects, each with its own minutes (e.g.
// Math = 15, Hindi = 15). Pressing Start counts down the FIRST subject.
// When a subject's time reaches 0:
//   - a short chime plays (~5s of the same completion sound, looped)
//   - the timer AUTO-CONTINUES straight into the next subject in the list
//     — it never resets and never pauses waiting for the user
// When the LAST subject finishes, the same chime plays again to mark the
// whole session as complete, and the timer stops (finished = true) instead
// of continuing.
//
// Elapsed seconds are also reported back tick-by-tick via onElapsedSecond,
// so the caller (App.jsx) can fold them into the existing Study Timer's
// "Time today" total — this timer's time still counts toward the overall
// daily total, it just no longer keeps its own separate per-subject
// breakdown (the "Today by Subject" list that used to read this has been
// removed, along with the Firestore writes that fed it).
//
// Persistence follows the same localStorage-mirror pattern as
// useCountdownTimer, so a background/reload doesn't lose progress or
// silently reset the running plan.
//
// Like useCountdownTimer, the countdown is anchored to an absolute
// wall-clock end timestamp (endAtRef) instead of decrementing remainingRef
// by 1 on every setInterval firing. A throttled/backgrounded tab doesn't
// fire its interval reliably once per second, so trusting tick-count alone
// makes the countdown fall behind real elapsed time — anchoring to
// Date.now() + remaining*1000 means every tick (however late) recomputes
// the correct remaining time instead of accumulating drift. See the longer
// explanation in useCountdownTimer.js.
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

  // Absolute wall-clock timestamp (ms) the ACTIVE subject's countdown is
  // aiming at — Date.now() + remaining*1000. null when paused. remainingRef
  // is just a display cache recomputed from this every tick; see the file
  // header comment for why. Falls back to reconstructing from `remaining`
  // for state saved before this field existed.
  const endAtRef = useRef(
    persisted?.running
      ? (persisted?.endAt ?? Date.now() + (persisted?.remaining ?? 0) * 1000)
      : null
  );

  const syncRemainingFromClock = () => {
    if (!runningRef.current || !endAtRef.current) return remainingRef.current;
    const fresh = Math.max(0, Math.round((endAtRef.current - Date.now()) / 1000));
    remainingRef.current = fresh;
    return fresh;
  };

  // Per-subject seconds accumulated locally since the last Firestore flush,
  // bucketed by day so a session that happens to cross midnight still
  // credits each day's own subjectDays doc correctly:
  //   { "2026-07-18": { Mathematics: 37, Physics: 12 }, ... }
  // Feeds addSubjectSeconds (lifetime total) AND addSubjectSecondsForDay
  // (this-week breakdown) on a short interval instead of writing on every
  // single tick, and also gets flushed immediately on pause/reset/clear/
  // unmount so a quick pause never silently drops a partial window.
  const pendingSubjectSecondsRef = useRef({});
  const FLUSH_MS = 8000;

  const flushPendingSubjectSeconds = () => {
    if (!uid) { pendingSubjectSecondsRef.current = {}; return; }
    const byDay = pendingSubjectSecondsRef.current;
    pendingSubjectSecondsRef.current = {};
    Object.entries(byDay).forEach(([day, bySubject]) => {
      Object.entries(bySubject).forEach(([name, secs]) => {
        if (secs > 0) {
          addSubjectSeconds(uid, name, secs).catch(() => {});
          addSubjectSecondsForDay(uid, day, name, secs).catch(() => {});
        }
      });
    });
  };

  useEffect(() => { runningRef.current = running; }, [running]);

  const persistNow = () => {
    persistState(uid, {
      dayKey,
      plan: planRef.current,
      activeIndex: activeIndexRef.current,
      remaining: remainingRef.current,
      running: runningRef.current,
      endAt: endAtRef.current,
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

  // Periodic + on-unmount flush of accumulated per-subject seconds to
  // Firestore (see pendingSubjectSecondsRef above).
  useEffect(() => {
    const id = setInterval(flushPendingSubjectSeconds, FLUSH_MS);
    return () => { clearInterval(id); flushPendingSubjectSeconds(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

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
    endAtRef.current = null; // only settable while stopped, so there's no running end target to update
    setRemaining(firstRemaining);
    setFinished(false);
    stopChime();
    persistState(uid, { dayKey, plan: cleaned, activeIndex: 0, remaining: firstRemaining, running: false, endAt: null });
  };

  const start = () => {
    if (!planRef.current.length) return;
    if (remainingRef.current <= 0) return;
    setFinished(false);
    runningRef.current = true;
    setRunning(true);
    // Anchor to an absolute end timestamp for the active subject — makes
    // the countdown immune to throttled/late ticks while backgrounded.
    endAtRef.current = Date.now() + remainingRef.current * 1000;
    // Push should only fire once the WHOLE plan is done, not the current
    // subject — so schedule it `secondsLeftInWholePlan` seconds out (time
    // left on the active subject + every subject still queued after it).
    const secondsLeftInWholePlan =
      remainingRef.current +
      planRef.current.slice(activeIndexRef.current + 1).reduce((sum, s) => sum + s.totalSeconds, 0);
    scheduleTimerNotification(secondsLeftInWholePlan);
    persistNow();
  };

  const pause = () => {
    // Resync from the wall clock before freezing, so a pause landing
    // between ticks doesn't drop the last fraction of elapsed time from
    // either the countdown face or the per-subject Firestore bucket.
    const before = remainingRef.current;
    const after = syncRemainingFromClock();
    const elapsed = before - after;
    if (elapsed > 0) {
      setRemaining(after);
      onElapsedSecond?.(elapsed);
      const activeName = planRef.current[activeIndexRef.current]?.name;
      if (activeName) {
        const key = dayKeyFor(new Date());
        const dayBucket = pendingSubjectSecondsRef.current[key] || (pendingSubjectSecondsRef.current[key] = {});
        dayBucket[activeName] = (dayBucket[activeName] || 0) + elapsed;
      }
    }
    runningRef.current = false;
    setRunning(false);
    endAtRef.current = null;
    // Countdown stopped early — cancel the pending push so it doesn't fire
    // later for a plan that's no longer running.
    cancelTimerNotification();
    persistNow();
    flushPendingSubjectSeconds();
  };

  const toggle = () => (runningRef.current ? pause() : start());

  // Resets the whole plan back to subject 0 at full durations.
  const reset = () => {
    runningRef.current = false;
    setRunning(false);
    endAtRef.current = null;
    activeIndexRef.current = 0;
    setActiveIndex(0);
    const firstRemaining = planRef.current[0]?.totalSeconds ?? 0;
    remainingRef.current = firstRemaining;
    setRemaining(firstRemaining);
    setFinished(false);
    stopChime();
    cancelTimerNotification();
    persistNow();
    flushPendingSubjectSeconds();
  };

  // Clears the plan entirely (e.g. user closes the Custom Timer card).
  const clearPlan = () => {
    runningRef.current = false;
    setRunning(false);
    endAtRef.current = null;
    planRef.current = [];
    setPlan([]);
    activeIndexRef.current = 0;
    setActiveIndex(0);
    remainingRef.current = 0;
    setRemaining(0);
    setFinished(false);
    stopChime();
    cancelTimerNotification();
    persistState(uid, { dayKey, plan: [], activeIndex: 0, remaining: 0, running: false, endAt: null });
    flushPendingSubjectSeconds();
  };

  // Credits `sec` elapsed seconds to both the overall "Time today" total and
  // the active subject's per-subject bucket. Pulled out of the tick loop so
  // it can be called with more than 1 second at once — needed because a
  // throttled/backgrounded gap can mean many real seconds passed between
  // two tick firings.
  const creditElapsedToActiveSubject = (sec, key) => {
    if (sec <= 0) return;
    onElapsedSecond?.(sec);
    const activeName = planRef.current[activeIndexRef.current]?.name;
    if (activeName) {
      const dayBucket = pendingSubjectSecondsRef.current[key] || (pendingSubjectSecondsRef.current[key] = {});
      dayBucket[activeName] = (dayBucket[activeName] || 0) + sec;
    }
  };

  // The countdown tick for the active subject. Anchored to endAtRef (an
  // absolute wall-clock timestamp) rather than trusting the interval to
  // fire once per second — see the file header comment. Because a
  // throttled gap can be long enough to blow past the CURRENT subject's
  // remaining time entirely, this resync can advance through several
  // finished subjects in one go, crediting each its own correct share of
  // the elapsed time, rather than assuming at most one subject completes
  // per tick.
  const tick = () => {
    const key = dayKeyFor(new Date());
    if (key !== dayKey) { setDayKey(key); return; }

    if (!runningRef.current || !endAtRef.current) return;
    if (!planRef.current.length) return;

    let now = Date.now();
    // Loop in case the elapsed wall-clock time is enough to finish more
    // than one subject at once (e.g. the app was backgrounded through two
    // short subjects' worth of time).
    while (true) {
      const before = remainingRef.current;
      const after = Math.max(0, Math.round((endAtRef.current - now) / 1000));
      const elapsed = before - after;
      if (elapsed > 0) {
        remainingRef.current = after;
        creditElapsedToActiveSubject(elapsed, key);
      }

      if (after > 0) {
        setRemaining(after);
        break; // still time left on the active subject — done for this tick
      }

      // Active subject just finished.
      const isLastSubject = activeIndexRef.current >= planRef.current.length - 1;
      if (isLastSubject) {
        runningRef.current = false;
        setRunning(false);
        setFinished(true);
        setRemaining(0);
        endAtRef.current = null;
        playFiveSecondChime();
        flushPendingSubjectSeconds();
        break;
      }

      // Auto-continue into the next subject, re-anchoring endAt from
      // wherever "now" actually landed relative to when the previous
      // subject's clock ran out (endAtRef, before this subject overwrites
      // it), so a multi-subject overshoot doesn't lose or double-count the
      // sliver of time between them.
      playFiveSecondChime();
      const overshootStart = endAtRef.current;
      activeIndexRef.current += 1;
      setActiveIndex(activeIndexRef.current);
      const nextTotal = planRef.current[activeIndexRef.current]?.totalSeconds ?? 0;
      endAtRef.current = overshootStart + nextTotal * 1000;
      remainingRef.current = nextTotal;
      // Loop again: `now` hasn't changed, so if the overshoot also blows
      // past this next subject, the loop will detect that on the next
      // pass and continue advancing.
    }

    persistState(uid, {
      dayKey: key,
      plan: planRef.current,
      activeIndex: activeIndexRef.current,
      remaining: remainingRef.current,
      running: runningRef.current,
      endAt: endAtRef.current,
    });
  };

  useEffect(() => {
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey, uid]);

  // Force an immediate resync the moment the app/tab is foregrounded again.
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
