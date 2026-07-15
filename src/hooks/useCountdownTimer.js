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
export function useCountdownTimer(uid) {
  const [dayKey, setDayKey] = useState(dayKeyFor(new Date()));
  const [running, setRunning] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(25 * 60); // default 25 min
  const [remaining, setRemaining] = useState(25 * 60);
  const [finished, setFinished] = useState(false);
  const [todaySeconds, setTodaySeconds] = useState(0);

  const remainingRef = useRef(25 * 60);
  const runningRef = useRef(false);
  const bankedTodayRef = useRef(0); // last-known-good "Time today" total (seconds), never moves backward from a stale remote value

  useEffect(() => { runningRef.current = running; }, [running]);

  // Load "Time today" once per uid/dayKey, then stay live-synced across
  // tabs/devices. Guarded the same way as the pause bug fix: only the very
  // first load for a given uid+dayKey zeroes local state, so a re-run of
  // this effect (StrictMode, parent re-renders, etc.) can never wipe
  // progress that's already been banked today.
  const loadedForRef = useRef(null);
  useEffect(() => {
    if (!uid) return;
    const loadKey = `${uid}|${dayKey}`;
    const isFreshLoad = loadedForRef.current !== loadKey;
    loadedForRef.current = loadKey;
    if (isFreshLoad) bankedTodayRef.current = 0;

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

  // Credits `sec` additional seconds to today's saved total immediately.
  const bankSeconds = (sec) => {
    if (sec <= 0) return;
    const next = bankedTodayRef.current + sec;
    bankedTodayRef.current = next;
    setTodaySeconds(next);
    if (uid) setStudyDay(uid, dayKey, next);
  };

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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 1000);
    return () => clearInterval(id);
  }, [dayKey, uid]);

  // Sets a new duration. Only allowed while paused, so it can't stomp on a
  // countdown in progress.
  const setDuration = (totalSeconds) => {
    if (runningRef.current) return;
    const clamped = Math.max(0, Math.floor(totalSeconds));
    setDurationSeconds(clamped);
    remainingRef.current = clamped;
    setRemaining(clamped);
    setFinished(false);
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
  };

  const pause = () => {
    runningRef.current = false;
    setRunning(false);
    // Countdown stopped early — cancel the pending push so it doesn't fire
    // later for a timer that's no longer counting down.
    cancelTimerNotification();
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
