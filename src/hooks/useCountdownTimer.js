// src/hooks/useCountdownTimer.js
import { useEffect, useRef, useState } from "react";
import { dayKeyFor } from "../lib/time";
import { getStudyDay, setStudyDay, watchStudyDay } from "../lib/firestore";
import { scheduleTimerNotification, cancelTimerNotification } from "../lib/timerNotifications";

// ---------------------------------------------------------------------------
// MODEL
// ---------------------------------------------------------------------------
// The user picks a duration (hours/minutes). Pressing Start counts DOWN from
// that duration. Whatever portion of it actually elapses — whether the user
// lets it run out, pauses partway, or the app gets backgrounded/killed and
// reopened later — is credited to "Time today" (users/{uid}/studyDays/{dayKey}
// in Firestore).
//
// SOURCE OF TRUTH: endAtRef.current, an absolute wall-clock timestamp
// (Date.now() + remainingSeconds*1000) the countdown is aiming at.
// remainingRef.current is just a display cache recomputed FROM endAtRef —
// never decremented by hand. This is what makes the countdown immune to
// throttled/delayed timers: whenever it's recomputed, it's recomputed from
// Date.now(), so it's instantly correct no matter how late the recompute
// happened to run.
//
// ONE RECONCILE FUNCTION, CALLED FROM EVERYWHERE
// ---------------------------------------------------------------------------
// Every place that used to have its own copy of "figure out how much time
// passed and bank it" now calls a single function: reconcile(). It:
//   1. Recomputes remaining from endAtRef (if running).
//   2. Banks whatever seconds elapsed since the last reconcile into
//      "Time today" (both the local ref/state AND queues a Firestore save).
//   3. Marks the countdown finished if it hit zero.
//   4. Mirrors the full state to localStorage.
//
// reconcile() is called at every point where time could have passed without
// us knowing:
//   - every ~1s while the app is open (setInterval)
//   - the instant the app is foregrounded again (visibilitychange/focus)
//   - the instant the app is about to be backgrounded (visibilitychange
//     hidden / blur / pagehide) — so the last fraction-of-a-second before
//     the JS runtime is frozen is never lost
//   - once on mount, BEFORE the first interval tick — so a background/kill
//     that happened while the app was fully closed is caught up on
//     immediately when it reopens, not a second later
//   - on pause() and reset(), before touching the running state
//
// HARD PLATFORM LIMIT (not fixable by any client code): once the OS fully
// freezes or kills the JS runtime — the app is swiped away, or a WebView
// wrapper (e.g. Median) reclaims it — NO JavaScript can run, so no save can
// happen at that exact moment. reconcile() being called before backgrounding
// and immediately on reopen closes that gap down to zero: nothing is ever
// permanently lost, it just can't be *visible* while the app has no runtime
// to show it in.
//
// SAVING TO FIRESTORE
// ---------------------------------------------------------------------------
// bankSeconds() updates local state/refs synchronously (so "Time today" on
// screen is always instantly correct) and marks a flush as pending.
// flushToFirestore() actually writes to Firestore, throttled to at most once
// every FLUSH_INTERVAL_MS via a periodic interval, but ALSO called
// immediately and synchronously right after every reconcile() that banked
// something at a "boundary" moment (backgrounding, pause, reset, mount
// catch-up) — so newly-earned seconds don't wait for the next periodic tick
// to reach the server.
//
// Writes are kept strictly sequential (flushInFlightRef) so two saves for
// the same day can never race and silently overwrite each other with a
// stale value.
const STORAGE_KEY_PREFIX = "focusly:timerState:";
const FLUSH_INTERVAL_MS = 2000;
const DEFAULT_DURATION_SECONDS = 25 * 60;

function loadPersistedState(uid) {
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + uid);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Ignore state from a previous calendar day — a new day starts fresh.
    if (parsed.dayKey !== dayKeyFor(new Date())) return null;
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
    // Storage full/unavailable (private browsing, etc.) — non-fatal; the
    // periodic Firestore flush is still the source of truth for "Time
    // today" even if this local mirror can't be written.
  }
}

export function useCountdownTimer(uid) {
  const persisted = loadPersistedState(uid);

  const [dayKey, setDayKey] = useState(persisted?.dayKey || dayKeyFor(new Date()));
  const [running, setRunning] = useState(persisted?.running || false);
  const [durationSeconds, setDurationSeconds] = useState(persisted?.durationSeconds ?? DEFAULT_DURATION_SECONDS);
  const [remaining, setRemaining] = useState(persisted?.remaining ?? persisted?.durationSeconds ?? DEFAULT_DURATION_SECONDS);
  const [finished, setFinished] = useState(false);
  const [todaySeconds, setTodaySeconds] = useState(persisted?.bankedToday || 0);

  const remainingRef = useRef(persisted?.remaining ?? persisted?.durationSeconds ?? DEFAULT_DURATION_SECONDS);
  const runningRef = useRef(persisted?.running || false);
  const durationRef = useRef(persisted?.durationSeconds ?? DEFAULT_DURATION_SECONDS);
  const bankedTodayRef = useRef(persisted?.bankedToday || 0); // last-known-good "Time today" total (seconds); never moves backward from a stale remote value

  // Absolute wall-clock timestamp the countdown is aiming at, in ms. null
  // when paused/not running. Restored from localStorage on mount so a
  // reload mid-countdown recomputes the correct remaining time immediately
  // from the original target, instead of resuming a stale cached number.
  const endAtRef = useRef(
    persisted?.running
      ? (persisted?.endAt ?? Date.now() + (persisted?.remaining ?? 0) * 1000) // fallback for state saved before endAt existed
      : null
  );

  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { durationRef.current = durationSeconds; }, [durationSeconds]);

  // ---------------------------------------------------------------------
  // "Time today" load + live cross-tab/cross-device sync
  // ---------------------------------------------------------------------
  const uidForRef = useRef(uid);
  useEffect(() => {
    if (uidForRef.current !== uid) {
      uidForRef.current = uid;
      bankedTodayRef.current = 0;
      setTodaySeconds(0);
    }
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    const applyRemote = ({ seconds }) => {
      if (cancelled) return;
      if (seconds <= bankedTodayRef.current) return; // forward-only: never let a stale remote value regress local progress
      bankedTodayRef.current = seconds;
      setTodaySeconds(seconds);
    };
    getStudyDay(uid, dayKey).then(applyRemote);
    const unsub = watchStudyDay(uid, dayKey, applyRemote);
    return () => { cancelled = true; unsub(); };
  }, [uid, dayKey]);

  // ---------------------------------------------------------------------
  // Banking + Firestore flush
  // ---------------------------------------------------------------------
  const pendingFlushRef = useRef(false);
  const flushInFlightRef = useRef(false);

  // Credits `sec` additional seconds to today's LOCAL total immediately, so
  // the on-screen number is never behind. Firestore persistence is handled
  // separately (see flushToFirestore) to avoid write-reordering.
  const bankSeconds = (sec) => {
    if (sec <= 0) return;
    bankedTodayRef.current += sec;
    setTodaySeconds(bankedTodayRef.current);
    pendingFlushRef.current = true;
  };

  const flushToFirestore = () => {
    if (!uid || !pendingFlushRef.current || flushInFlightRef.current) return;
    flushInFlightRef.current = true;
    pendingFlushRef.current = false;
    const valueAtFlushTime = bankedTodayRef.current;
    setStudyDay(uid, dayKey, valueAtFlushTime)
      .catch((err) => {
        console.warn("[timer] Failed to save today's time, will retry:", err);
        pendingFlushRef.current = true; // retry on the next flush
      })
      .finally(() => {
        flushInFlightRef.current = false;
      });
  };

  const persistNow = () => {
    persistState(uid, {
      dayKey,
      running: runningRef.current,
      durationSeconds: durationRef.current,
      remaining: remainingRef.current,
      bankedToday: bankedTodayRef.current,
      endAt: endAtRef.current,
    });
  };

  // ---------------------------------------------------------------------
  // THE single reconcile function — computes "how much time has actually
  // passed since we last checked" and banks it. Every trigger in this file
  // (interval tick, foreground, backgrounding, mount, pause, reset) calls
  // this instead of keeping its own copy of the same three lines.
  //
  // `opts.flushNow` — pass true from any "boundary" trigger (backgrounding,
  // pause, reset, mount catch-up) so the newly-banked seconds reach
  // Firestore immediately instead of waiting for the next periodic flush.
  // ---------------------------------------------------------------------
  const reconcile = ({ flushNow = false } = {}) => {
    // Roll over to a fresh day if the calendar date changed while running.
    const key = dayKeyFor(new Date());
    if (key !== dayKey) {
      setDayKey(key);
      return;
    }

    if (runningRef.current && endAtRef.current) {
      const before = remainingRef.current;
      const after = Math.max(0, Math.round((endAtRef.current - Date.now()) / 1000));
      remainingRef.current = after;
      const elapsed = before - after; // real seconds actually passed — often 1, but can be many after a throttled/backgrounded gap
      if (elapsed > 0) {
        setRemaining(after);
        bankSeconds(elapsed);
      }
      if (after <= 0) {
        runningRef.current = false;
        setRunning(false);
        setFinished(true);
        endAtRef.current = null;
        // Countdown reached 0 naturally — the server-scheduled push (if any)
        // fires on its own; nothing to cancel here.
      }
    }

    persistNow();
    if (flushNow) flushToFirestore();
  };

  // ---------------------------------------------------------------------
  // Trigger points — all of them just call reconcile()
  // ---------------------------------------------------------------------

  // Foreground interval: runs every ~1s while the app is open. Safe to fire
  // late (throttled background tab) because reconcile() always recomputes
  // from the absolute endAt timestamp rather than trusting the interval's
  // own cadence.
  useEffect(() => {
    const id = setInterval(() => reconcile(), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey, uid]);

  // Periodic Firestore flush — backstop in case a boundary trigger below
  // didn't fire flushNow for some reason.
  useEffect(() => {
    const id = setInterval(flushToFirestore, FLUSH_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, dayKey]);

  // MOUNT CATCH-UP: reconcile immediately on load/reopen — this is what
  // credits "Time today" for a gap where the app was fully backgrounded or
  // killed and no interval could run at all. Runs once, synchronously,
  // before the user sees the screen.
  const didMountReconcileRef = useRef(false);
  useEffect(() => {
    if (didMountReconcileRef.current) return;
    didMountReconcileRef.current = true;
    reconcile({ flushNow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // FOREGROUND: the instant the app/tab becomes visible again, resync
  // immediately rather than waiting for the next interval tick.
  // BACKGROUNDING: the instant the app/tab is about to be hidden, reconcile
  // + flush immediately — this is the last chance to save before the JS
  // runtime may be frozen/killed with no warning. "blur" is included
  // because some native WebView wrappers don't reliably fire
  // visibilitychange before suspending the runtime.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") reconcile();
      else reconcile({ flushNow: true });
    };
    const onHideLike = () => reconcile({ flushNow: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    window.addEventListener("blur", onHideLike);
    window.addEventListener("pagehide", onHideLike);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      window.removeEventListener("blur", onHideLike);
      window.removeEventListener("pagehide", onHideLike);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey, uid]);

  // ---------------------------------------------------------------------
  // User actions
  // ---------------------------------------------------------------------

  // Sets a new duration. Only allowed while paused, so it can't stomp on a
  // countdown in progress.
  const setDuration = (totalSeconds) => {
    if (runningRef.current) return;
    const clamped = Math.max(0, Math.floor(totalSeconds));
    setDurationSeconds(clamped);
    durationRef.current = clamped;
    remainingRef.current = clamped;
    endAtRef.current = null; // only settable while paused, so there's no running end target to update
    setRemaining(clamped);
    setFinished(false);
    persistState(uid, { dayKey, running: false, durationSeconds: clamped, remaining: clamped, bankedToday: bankedTodayRef.current, endAt: null });
  };

  const start = () => {
    if (remainingRef.current <= 0) return; // nothing to run — set a duration first
    setFinished(false);
    runningRef.current = true;
    setRunning(true);
    // Anchor to an absolute end timestamp based on however much time is
    // left right now — this is what makes the countdown immune to
    // throttled/late ticks while backgrounded.
    endAtRef.current = Date.now() + remainingRef.current * 1000;
    // Ask the server to push a "timer complete" notification after however
    // many seconds are left, so the alert still reaches the user if they
    // background or close the app before it finishes.
    scheduleTimerNotification(remainingRef.current);
    persistNow();
  };

  const pause = () => {
    // Bank whatever's actually elapsed up to this exact moment before
    // freezing the clock.
    reconcile({ flushNow: true });
    runningRef.current = false;
    setRunning(false);
    endAtRef.current = null;
    cancelTimerNotification();
    persistNow();
  };

  const toggle = () => {
    if (runningRef.current) pause();
    else start();
  };

  // Resets the clock face back to the chosen duration (does not touch
  // "Time today" — already-banked seconds stay banked).
  const reset = () => {
    reconcile({ flushNow: true }); // bank anything elapsed before wiping the clock face
    runningRef.current = false;
    setRunning(false);
    endAtRef.current = null;
    remainingRef.current = durationRef.current;
    setRemaining(durationRef.current);
    setFinished(false);
    cancelTimerNotification();
    persistNow();
  };

  // Credits seconds from an OTHER running clock (the Custom/Subject Timer)
  // into this same "Time today" bank. Reuses the same bankSeconds/flush
  // machinery — does not touch remaining/durationSeconds/running, which
  // belong solely to the Study Timer's own countdown.
  const creditExternalSeconds = (sec) => {
    bankSeconds(sec);
    flushToFirestore();
    persistNow();
  };

  return {
    remaining,          // seconds left on the countdown
    durationSeconds,     // the currently-set total duration in seconds
    running,
    finished,            // true right after the countdown hits 0, until reset/new duration
    todaySeconds,        // "Time today" total (seconds), same meaning as the old stopwatch's todaySeconds
    setDuration,
    start,
    pause,
    toggle,
    reset,
    dayKey,
    creditExternalSeconds,
  };
}
