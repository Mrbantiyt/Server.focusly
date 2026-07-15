// src/hooks/useCountdownTimer.js
import { useEffect, useRef, useState } from "react";
import { dayKeyFor } from "../lib/time";
import { getStudyDay, setStudyDay, watchStudyDay } from "../lib/firestore";
import { scheduleTimerNotification, cancelTimerNotification } from "../lib/timerNotifications";

// ---------------------------------------------------------------------------
// MODEL — replaces the old auto-counting stopwatch with a manual countdown.
// ---------------------------------------------------------------------------
// The user picks a duration (hours/minutes). Pressing Start counts DOWN from
// that duration. Whatever portion of it actually elapses — whether the user
// lets it run out or pauses partway — is credited to "Time today", which is
// the same users/{uid}/studyDays/{dayKey} Firestore doc the old stopwatch
// used, so history/leaderboard/graphs keep working unchanged.
//
// remainingRef.current is the source of truth for what's left on the clock,
// in whole seconds. It only changes at well-defined moments (Start, Pause,
// a finished tick, or Set Duration while paused) — never inferred from a
// running wall-clock diff the way the old stopwatch did, which is what let
// stray re-renders desync it. That's the whole reason this feels reliable:
// there's exactly one place that mutates remainingRef.current outside the
// 1s tick, and the 1s tick only ever counts down by exactly 1.
//
// PERSISTENCE ACROSS BACKGROUND/RELOAD: on a native-wrapped app (Median),
// backgrounding the app or the OS reclaiming the WebView can interrupt or
// fully reload the JS runtime without reliably firing browser lifecycle
// events like visibilitychange/pagehide first. Two consequences this hook
// specifically guards against:
//   1. The countdown clock itself (`remaining`) lived only in memory, so a
//      reload snapped it back to the full duration — losing all visible
//      countdown progress even though time had genuinely been spent.
//   2. "Time today" was only saved to Firestore periodically (every 5s) —
//      any seconds ticked since the last flush were gone if the app died
//      before the next one.
// Fix: the full timer state (remaining/running/durationSeconds/bankedToday)
// is mirrored to localStorage on every tick and restored on mount, and the
// Firestore flush interval is now 2s instead of 5s to shrink the loss
// window for the "Time today" total specifically (localStorage covers the
// gap between flushes; the flush interval only bounds how stale the
// *server-side* copy can get before the next save).
const STORAGE_KEY_PREFIX = "focusly:timerState:";

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
    // periodic Firestore flush is still the source of truth for
    // "Time today" even if this local mirror can't be written.
  }
}

export function useCountdownTimer(uid) {
  const persisted = loadPersistedState(uid);

  const [dayKey, setDayKey] = useState(persisted?.dayKey || dayKeyFor(new Date()));
  const [running, setRunning] = useState(persisted?.running || false);
  const [durationSeconds, setDurationSeconds] = useState(persisted?.durationSeconds ?? 25 * 60); // default 25 min
  const [remaining, setRemaining] = useState(persisted?.remaining ?? persisted?.durationSeconds ?? 25 * 60);
  const [finished, setFinished] = useState(false);
  const [todaySeconds, setTodaySeconds] = useState(persisted?.bankedToday || 0);

  const remainingRef = useRef(persisted?.remaining ?? persisted?.durationSeconds ?? 25 * 60);
  const runningRef = useRef(persisted?.running || false);
  const bankedTodayRef = useRef(persisted?.bankedToday || 0); // last-known-good "Time today" total (seconds), never moves backward from a stale remote value

  useEffect(() => { runningRef.current = running; }, [running]);

  // Load "Time today" once per uid/dayKey, then stay live-synced across
  // tabs/devices.
  //
  // uidForRef tracks whose data bankedTodayRef currently holds. It's only
  // force-reset when the SIGNED-IN USER actually changes (e.g. logout ->
  // different account login in the same session) — carrying one user's
  // banked seconds into another user's session would be a real bug.
  // Changing dayKey alone (midnight rollover, or the persisted-state check
  // rejecting a stale day) does NOT reset here: loadPersistedState() at
  // mount already only returns state matching today's dayKey, and
  // applyRemote's forward-only guard below prevents a stale/lower remote
  // value from ever regressing local state — so there's nothing left for a
  // same-user reset to protect against, and doing it anyway would just
  // re-introduce the "wipes in-progress local time" bug from before.
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
      if (seconds <= bankedTodayRef.current) return;
      bankedTodayRef.current = seconds;
      setTodaySeconds(seconds);
    };
    getStudyDay(uid, dayKey).then(applyRemote);
    const unsub = watchStudyDay(uid, dayKey, applyRemote);
    return () => { cancelled = true; unsub(); };
  }, [uid, dayKey]);

  // Credits `sec` additional seconds to today's LOCAL total immediately —
  // this always happens every tick, so the on-screen "Time today" number is
  // never behind. Persisting to Firestore is handled separately by
  // flushToFirestore (see below), specifically to avoid a race that used to
  // lose a few seconds on every refresh.
  //
  // THE BUG THIS FIXES: the previous version called setStudyDay (a
  // Firestore transaction that WRITES AN ABSOLUTE VALUE) on every single
  // tick, once per second. setStudyDay is async, and nothing prevented two
  // of those transactions from being in flight at once. If a network hiccup
  // let an EARLIER second's write (say, value 9) complete AFTER a LATER
  // one (value 10), the earlier write would land last and silently
  // overwrite the newer value — so the saved total would jump backward by
  // however many seconds separated them. That's exactly the "a few
  // seconds/minutes go missing" symptom: it wasn't lost every time (needed
  // the writes to actually reorder), but with a transaction firing every
  // single second, reordering was common enough to notice constantly.
  //
  // Fixing it two ways at once:
  //   1. Writes are throttled (every FLUSH_INTERVAL_MS, not every tick) —
  //      far fewer transactions, so far fewer chances to reorder.
  //   2. Writes are made strictly SEQUENTIAL (flushInFlightRef) — a new
  //      flush is never started while a previous one is still pending, so
  //      two writes for the same day can never race each other. Whichever
  //      value is queued after the in-flight one finishes always wins,
  //      newest-last, in order.
  const bankSeconds = (sec) => {
    if (sec <= 0) return;
    bankedTodayRef.current += sec;
    setTodaySeconds(bankedTodayRef.current);
    pendingFlushRef.current = true;
  };

  const flushInFlightRef = useRef(false);
  const pendingFlushRef = useRef(false);
  const flushToFirestore = () => {
    if (!uid || !pendingFlushRef.current || flushInFlightRef.current) return;
    flushInFlightRef.current = true;
    pendingFlushRef.current = false;
    const valueAtFlushTime = bankedTodayRef.current;
    setStudyDay(uid, dayKey, valueAtFlushTime)
      .catch((err) => {
        console.warn("[timer] Failed to save today's time, will retry:", err);
        pendingFlushRef.current = true; // retry on the next flush tick
      })
      .finally(() => {
        flushInFlightRef.current = false;
      });
  };

  // Periodic throttled save (every 2s) — keeps Firestore reasonably
  // up-to-date without writing on every tick. Also flushes immediately on
  // Pause/Reset/tab-hide/unload elsewhere so nothing meaningful is lost if
  // the app closes between periodic flushes. 2s (rather than the earlier
  // 5s) narrows how much "Time today" could theoretically be behind if the
  // app is killed between flushes and localStorage is unavailable too —
  // localStorage persistence below is the primary defense, this is the
  // backup bound.
  useEffect(() => {
    const id = setInterval(flushToFirestore, 2000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, dayKey]);

  // Flush on tab hide / app backgrounding / unload — covers the case where
  // the periodic 5s interval hasn't fired yet but the user is leaving.
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "hidden") flushToFirestore(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushToFirestore);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushToFirestore);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, dayKey]);

  // The 1-second countdown tick.
  useEffect(() => {
    const id = setInterval(() => {
      const key = dayKeyFor(new Date());
      if (key !== dayKey) { setDayKey(key); return; } // fresh day: let the load effect above pick up the new doc

      if (!runningRef.current) return;
      if (remainingRef.current <= 0) return;

      remainingRef.current -= 1;
      setRemaining(remainingRef.current);
      bankSeconds(1); // credit this elapsed second to "Time today" right away, so pausing never loses progress

      if (remainingRef.current <= 0) {
        runningRef.current = false;
        setRunning(false);
        setFinished(true);
        // The countdown reached 0 naturally — the scheduled push (if any)
        // is about to fire on its own from the server side; nothing to
        // cancel here. If it was somehow already delivered early or lost,
        // that's a rare edge case the in-app alert loop below still covers
        // while the app is open.
      }

      // Mirror the full timer state to localStorage every tick, so a
      // background/reload interruption resumes from here instead of
      // resetting the visible countdown and losing whatever hasn't reached
      // Firestore yet. See the big comment at the top of this file.
      persistState(uid, {
        dayKey,
        running: runningRef.current,
        durationSeconds,
        remaining: remainingRef.current,
        bankedToday: bankedTodayRef.current,
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 1000);
    return () => clearInterval(id);
  }, [dayKey, uid, durationSeconds]);

  // Snapshot current state to localStorage right now (not waiting for the
  // next tick) — used after any explicit user action that changes state.
  const persistNow = () => {
    persistState(uid, {
      dayKey,
      running: runningRef.current,
      durationSeconds,
      remaining: remainingRef.current,
      bankedToday: bankedTodayRef.current,
    });
  };

  // Sets a new duration. Only allowed while paused, so it can't stomp on a
  // countdown in progress.
  const setDuration = (totalSeconds) => {
    if (runningRef.current) return;
    const clamped = Math.max(0, Math.floor(totalSeconds));
    setDurationSeconds(clamped);
    remainingRef.current = clamped;
    setRemaining(clamped);
    setFinished(false);
    persistState(uid, { dayKey, running: false, durationSeconds: clamped, remaining: clamped, bankedToday: bankedTodayRef.current });
  };

  const start = () => {
    if (remainingRef.current <= 0) return; // nothing to run — set a duration first
    setFinished(false);
    runningRef.current = true;
    setRunning(true);
    // Ask the server to push a "timer complete" notification after however
    // many seconds are left right now, so the alert still reaches the user
    // if they background or close the app before it finishes.
    scheduleTimerNotification(remainingRef.current);
    persistNow();
  };

  const pause = () => {
    runningRef.current = false;
    setRunning(false);
    // Countdown stopped early — cancel the pending push so it doesn't fire
    // later for a timer that's no longer counting down.
    cancelTimerNotification();
    // Save right away rather than waiting for the next periodic flush, so
    // the just-earned seconds are never at risk of being lost if the app
    // closes shortly after pausing.
    flushToFirestore();
    persistNow();
  };

  const toggle = () => {
    if (runningRef.current) pause();
    else start();
  };

  // Resets the clock face back to the chosen duration (does not touch
  // "Time today" — already-banked seconds stay banked).
  const reset = () => {
    runningRef.current = false;
    setRunning(false);
    remainingRef.current = durationSeconds;
    setRemaining(durationSeconds);
    setFinished(false);
    cancelTimerNotification();
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
  };
}
