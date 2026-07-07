// src/hooks/useStopwatch.js
import { useEffect, useRef, useState } from "react";
import { dayKeyFor } from "../lib/time";
import { getStudyDay, setStudyDay, watchStudyDay } from "../lib/firestore";

// Writes to Firestore aren't cheap if done every second, so we tick locally
// every 1s for a smooth UI, and flush the real value to Firestore every
// FLUSH_MS, plus immediately on pause / tab close / day rollover.
const FLUSH_MS = 8000;

// NOTE on why this is wall-clock based, not tick-counted:
// Mobile browsers/webviews throttle or fully suspend `setInterval` once the
// screen turns off or the app goes to the background, to save battery. A
// naive "+1 every 1000ms" loop would then simply stop accumulating time for
// as long as the screen was off, even though `running` stayed true. Instead,
// whenever the stopwatch is running we stamp `runStartedAt` (a Date.now()
// epoch) and always derive the *true* elapsed time as
// `bankedSeconds + (Date.now() - runStartedAt) / 1000` — so no matter how
// delayed or infrequent the interval actually fires, the moment it does fire
// (e.g. right when the screen turns back on) it recomputes from real time
// and is instantly correct, with nothing lost.
//
// There are two separate numbers here on purpose:
//  - `todaySeconds` = the banked cloud total for "Time today". It only ever
//    grows while running, and is only ever zeroed automatically at the next
//    midnight (12:00 AM) rollover. This is what Dashboard/Calendar/Graph/Settings show.
//  - `displaySeconds` = what the big circular stopwatch shows. It normally
//    tracks todaySeconds, but the Reset button can zero *just this*, e.g. to
//    start a fresh-looking session, without touching the real banked total.
export function useStopwatch(uid) {
  const [dayKey, setDayKey] = useState(dayKeyFor(new Date()));
  const [todaySeconds, setTodaySeconds] = useState(0);
  const [displayOffset, setDisplayOffset] = useState(0); // seconds subtracted for a "face reset"
  const [running, setRunning] = useState(false);
  const [, forceTick] = useState(0);
  const flushedAtRef = useRef(0);
  const runStartedAtRef = useRef(null); // Date.now() when the current run began, or null if paused

  // Real elapsed seconds banked so far "today", live-including the current run.
  const liveTodaySeconds = () => {
    if (!running || !runStartedAtRef.current) return todaySeconds;
    const ranMs = Date.now() - runStartedAtRef.current;
    return todaySeconds + Math.max(0, ranMs / 1000);
  };

  // load today's value once, then keep listening for cross-device changes
  useEffect(() => {
    if (!uid) return;
    let unsub = () => {};
    getStudyDay(uid, dayKey).then((s) => {
      setTodaySeconds(s);
    });
    unsub = watchStudyDay(uid, dayKey, (s) => {
      // don't fight with our own local ticking — only accept remote value
      // if it's meaningfully ahead (e.g. same account open on another device)
      setTodaySeconds((cur) => (s > cur ? s : cur));
    });
    return unsub;
  }, [uid, dayKey]);

  // 1s re-render tick + midnight rollover check. This no longer *accumulates*
  // time itself — it just forces a re-render (so the UI visibly counts up)
  // and checks whether we've crossed into a new day. The actual elapsed
  // value always comes from liveTodaySeconds() / real timestamps, so even if
  // this interval gets throttled while the screen is off, nothing is lost.
  useEffect(() => {
    const id = setInterval(() => {
      const key = dayKeyFor(new Date());
      if (key !== dayKey) {
        if (uid) setStudyDay(uid, dayKey, Math.floor(liveTodaySeconds())); // flush the finished day
        setDayKey(key);
        setTodaySeconds(0);     // auto-reset right after midnight
        setDisplayOffset(0);    // stopwatch face resets too for the new day
        runStartedAtRef.current = running ? Date.now() : null;
        return;
      }
      forceTick((n) => n + 1);
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey, uid, running]);

  // periodic flush to Firestore while running (banks the live wall-clock value)
  useEffect(() => {
    if (!uid) return;
    const id = setInterval(() => {
      if (running && Date.now() - flushedAtRef.current > FLUSH_MS) {
        flushedAtRef.current = Date.now();
        setStudyDay(uid, dayKey, Math.floor(liveTodaySeconds()));
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, uid, dayKey]);

  const toggle = () => {
    setRunning((r) => {
      const next = !r;
      if (next) {
        // starting/resuming: mark the real start time of this run
        runStartedAtRef.current = Date.now();
      } else {
        // pausing: bank the real elapsed time and stop tracking a run start
        const banked = Math.floor(liveTodaySeconds());
        setTodaySeconds(banked);
        runStartedAtRef.current = null;
        if (uid) setStudyDay(uid, dayKey, banked);
      }
      return next;
    });
  };

  // Flush immediately if the tab goes to background or closes while running,
  // so switching apps / locking the phone never loses unsaved seconds. Also
  // snap the UI the moment it becomes visible again, rather than waiting up
  // to 1s for the next tick.
  useEffect(() => {
    if (!uid) return;
    const flushNow = () => {
      if (running) setStudyDay(uid, dayKey, Math.floor(liveTodaySeconds()));
    };
    const onVisibility = () => {
      forceTick((n) => n + 1);
      if (document.visibilityState === "hidden") flushNow();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", flushNow);
    window.addEventListener("pagehide", flushNow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", flushNow);
      window.removeEventListener("pagehide", flushNow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, dayKey, running]);

  // Zeroes only the stopwatch FACE (via an offset). "Time today"
  // (todaySeconds) is untouched and keeps counting in the background — it
  // only resets at midnight.
  const reset = () => setDisplayOffset(liveTodaySeconds());

  const live = liveTodaySeconds();
  const displaySeconds = Math.max(0, live - displayOffset);

  return { seconds: displaySeconds, todaySeconds: live, running, toggle, reset, dayKey };
}
