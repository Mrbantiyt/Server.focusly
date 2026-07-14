// src/hooks/useStopwatch.js
import { useEffect, useRef, useState } from "react";
import { dayKeyFor } from "../lib/time";
import { getStudyDay, setStudyDay, watchStudyDay } from "../lib/firestore";

// Writes to Firestore aren't cheap if done every second, so we tick locally
// every 1s for a smooth UI, and flush the real value to Firestore every
// FLUSH_MS, plus immediately on pause / tab close / day rollover.
const FLUSH_MS = 8000;

// ---------------------------------------------------------------------------
// MODEL
// ---------------------------------------------------------------------------
// "Time today" comes ONLY from this Study Stopwatch. Task timers on the
// Tasks tab run and track their own elapsed time independently, and do NOT
// add to "Time today" — they're separate by design.
//
// bankedRef.current is the last-known-good total (never moves backward).
// While running, the true current total is always computed fresh as
// bankedRef.current + secondsSinceRunStarted() from a wall-clock timestamp
// (runStartedAtRef) — never accumulated tick by tick — so throttled/
// suspended intervals (screen off, backgrounded tab) never lose time.
//
//   todaySeconds (Time today)  = liveStopwatch()
//   displaySeconds (face)      = liveStopwatch() - sessionBaseRef.current
// sessionBaseRef is a snapshot of bankedRef taken when Reset is pressed —
// it never moves bankedRef itself, so "Time today" can never go backward
// and the face can never go negative.
//
// Remote values (cross-device sync) only ever move bankedRef.current
// FORWARD, and whenever they do, runStartedAtRef is re-stamped to "now" so
// seconds already folded into the new remote total are never
// double-counted on top of a stale run-start timestamp.
export function useStopwatch(uid) {
  const [dayKey, setDayKey] = useState(dayKeyFor(new Date()));
  const [running, setRunning] = useState(false);
  const [, forceTick] = useState(0);

  const bankedRef = useRef(0);          // last-known-good stopwatch total (never moves backward)
  const sessionBaseRef = useRef(0);     // bankedRef snapshot at last face-reset
  const runStartedAtRef = useRef(null); // Date.now() when the current run began, or null if paused
  const runningRef = useRef(false);     // mirrors `running`, readable from effects/closures without re-subscribing
  const flushedAtRef = useRef(0);

  useEffect(() => { runningRef.current = running; }, [running]);

  // True elapsed stopwatch seconds right now, live-including the current run.
  const liveStopwatch = () => {
    if (!runningRef.current || !runStartedAtRef.current) return bankedRef.current;
    const ranSec = Math.max(0, (Date.now() - runStartedAtRef.current) / 1000);
    return bankedRef.current + ranSec;
  };

  // Accepts { seconds } learned from Firestore (initial load or live sync).
  // Only ever moves bankedRef FORWARD (and re-stamps the run start so a
  // run in progress doesn't double-count).
  const applyRemote = ({ seconds }) => {
    if (seconds <= bankedRef.current) return;
    bankedRef.current = seconds;
    if (runningRef.current) runStartedAtRef.current = Date.now();
    forceTick((n) => n + 1);
  };

  const loadedForRef = useRef(null); // `${uid}|${dayKey}` this hook's state currently reflects

  // load today's value once, then keep listening for cross-device changes
  useEffect(() => {
    if (!uid) return;
    const loadKey = `${uid}|${dayKey}`;
    // Guard against wiping an in-progress (possibly running, non-zero)
    // stopwatch just because this effect instance re-ran for a reason
    // other than an actual uid/dayKey change — e.g. a parent re-render
    // recreating the `user` object reference, or React re-invoking effects.
    // Only zero the local state the FIRST time we see this uid+dayKey
    // combination; every subsequent run for the same combination just
    // re-subscribes without touching bankedRef, so pausing (which
    // triggers a re-render) can never appear to reset the timer to 0.
    const isFreshLoad = loadedForRef.current !== loadKey;
    loadedForRef.current = loadKey;
    if (isFreshLoad) {
      bankedRef.current = 0;
      sessionBaseRef.current = 0;
      runStartedAtRef.current = runningRef.current ? Date.now() : null;
    }

    let cancelled = false;
    // Guard the live subscription the same way the one-time getStudyDay()
    // read already is: if this effect instance gets torn down (e.g. React
    // StrictMode's mount -> cleanup -> mount cycle), a snapshot already in
    // flight from the old listener must be ignored instead of applied.
    const guardedApplyRemote = (d) => { if (!cancelled) applyRemote(d); };
    getStudyDay(uid, dayKey).then((d) => guardedApplyRemote(d));
    const unsub = watchStudyDay(uid, dayKey, guardedApplyRemote);

    return () => { cancelled = true; unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, dayKey]);

  // 1s re-render tick + midnight rollover check. Doesn't accumulate time
  // itself — just forces a re-render so the UI visibly counts up, and
  // checks whether we've crossed into a new day.
  //
  // IMPORTANT (perf): this interval used to call forceTick() unconditionally
  // every second, forever — even while paused, even on tabs that don't show
  // the stopwatch at all. Since this hook lives in App.jsx (mounted for the
  // whole session), that meant the ENTIRE app re-rendered once a second no
  // matter what the user was doing. The face only ever needs to visibly
  // count up while actually running, so now we skip the re-render (but
  // still check for day rollover) whenever the stopwatch is paused.
  useEffect(() => {
    const id = setInterval(() => {
      const key = dayKeyFor(new Date());
      if (key !== dayKey) {
        if (uid) setStudyDay(uid, dayKey, Math.floor(liveStopwatch())); // flush the finished day
        bankedRef.current = 0;
        sessionBaseRef.current = 0;
        runStartedAtRef.current = runningRef.current ? Date.now() : null;
        setDayKey(key);
        return;
      }
      if (runningRef.current) forceTick((n) => n + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [dayKey, uid]);

  // periodic flush to Firestore while running (banks the live wall-clock value)
  useEffect(() => {
    if (!uid) return;
    const id = setInterval(() => {
      if (runningRef.current && Date.now() - flushedAtRef.current > FLUSH_MS) {
        flushedAtRef.current = Date.now();
        setStudyDay(uid, dayKey, Math.floor(liveStopwatch()));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [uid, dayKey]);

  const toggle = () => {
    // Side effects (ref mutations, Firestore write) must NOT live inside the
    // setRunning updater. React can invoke a state updater more than once
    // for a single call (StrictMode's double-invoke, or fast repeated
    // taps before a re-render flushes) — if the ref mutations happened
    // inside the updater, a double-invoke would double-toggle
    // runStartedAtRef/bankedRef, causing the visible time to jump and the
    // Play/Pause button to feel unresponsive or "stuck" on rapid taps.
    // Doing the real work here, once, keyed off runningRef.current (not
    // the possibly-stale `running` state), makes toggle() idempotent per
    // actual click.
    const next = !runningRef.current;
    runningRef.current = next;
    if (next) {
      // starting/resuming: mark the real start time of this run
      runStartedAtRef.current = Date.now();
      setRunning(next);
    } else {
      // pausing: bank the real elapsed time, save it, then hard-refresh the
      // page. A full reload forces every piece of state (this hook, the
      // Firestore listeners, everything upstream in App.jsx) to rebuild
      // from scratch off freshly-fetched data, which sidesteps any stale
      // in-memory state entirely. We wait for the Firestore write to
      // finish first so the reload always picks up the just-banked time
      // instead of racing it.
      const banked = Math.floor(liveStopwatch());
      bankedRef.current = banked;
      runStartedAtRef.current = null;
      setRunning(next);
      const doReload = () => window.location.reload();
      if (uid) {
        setStudyDay(uid, dayKey, banked).then(doReload).catch(doReload);
      } else {
        doReload();
      }
    }
  };

  // Flush immediately if the tab goes to background or closes while running,
  // so switching apps / locking the phone never loses unsaved seconds. Also
  // snap the UI the moment it becomes visible again, rather than waiting up
  // to 1s for the next tick.
  useEffect(() => {
    if (!uid) return;
    const flushNow = () => {
      if (runningRef.current) setStudyDay(uid, dayKey, Math.floor(liveStopwatch()));
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
  }, [uid, dayKey]);

  // Zeroes only the stopwatch FACE (via a snapshot of the current banked
  // stopwatch total). "Time today" is untouched and keeps counting in the
  // background — it only resets automatically at midnight.
  const reset = () => { sessionBaseRef.current = liveStopwatch(); forceTick((n) => n + 1); };

  const liveSw = liveStopwatch();
  const displaySeconds = Math.max(0, liveSw - sessionBaseRef.current);
  const todaySeconds = liveSw;

  return { seconds: displaySeconds, todaySeconds, running, toggle, reset, dayKey };
}
