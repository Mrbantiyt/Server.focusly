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
  // Highest value we ourselves have written to Firestore this session.
  // Any inbound snapshot smaller than this is guaranteed to be a stale
  // echo of an earlier in-flight write landing out of order, not real
  // new information, and must never overwrite a more recent local write
  // (this is what caused "Time today" to snap backward right after pausing).
  const lastLocalWriteRef = useRef(0);

  useEffect(() => { runningRef.current = running; }, [running]);

  // All local writes MUST go through this so lastLocalWriteRef always
  // reflects the freshest value we've sent, regardless of network timing.
  const writeStudyDay = (writeUid, writeDayKey, value) => {
    lastLocalWriteRef.current = Math.max(lastLocalWriteRef.current, value);
    setStudyDay(writeUid, writeDayKey, value);
  };

  // True elapsed stopwatch seconds right now, live-including the current run.
  const liveStopwatch = () => {
    if (!runningRef.current || !runStartedAtRef.current) return bankedRef.current;
    const ranSec = Math.max(0, (Date.now() - runStartedAtRef.current) / 1000);
    return bankedRef.current + ranSec;
  };

  // Accepts { seconds } learned from Firestore (initial load or live sync).
  // Only ever moves bankedRef FORWARD, and only based on what the live
  // total already reflects — never based on the stale bankedRef snapshot.
  //
  // Why this matters: while running, periodic flushes write the live total
  // to Firestore but deliberately don't touch bankedRef/runStartedAtRef
  // (the run is still in progress). When that write's own echo comes back
  // through the onSnapshot listener some time later (network round-trip),
  // comparing the incoming value only against the old bankedRef made it
  // look "newer" than what was banked, even though real (wall-clock) time
  // had since moved on further. That overwrote bankedRef with a
  // slightly-stale number AND re-stamped runStartedAtRef to "now" —
  // silently dropping every second between when the flush was sent and
  // when its echo arrived. Comparing against liveStopwatch() (which
  // already accounts for elapsed run time) instead of bankedRef.current
  // makes a same-session echo a guaranteed no-op, so no time is lost.
  const applyRemote = ({ seconds }) => {
    // Guard against a stale echo of an EARLIER local write landing after a
    // LATER local write already banked a smaller number (e.g. a periodic
    // flush's echo arriving after a pause-write). lastLocalWriteRef always
    // reflects the most recent value we ourselves sent, so any inbound
    // value below it is old news and must be ignored — liveStopwatch()
    // alone won't catch this once we're paused, since it just returns
    // bankedRef at that point.
    if (seconds <= liveStopwatch() || seconds < lastLocalWriteRef.current) return;
    bankedRef.current = seconds;
    if (runningRef.current) runStartedAtRef.current = Date.now();
    forceTick((n) => n + 1);
  };

  // load today's value once, then keep listening for cross-device changes
  useEffect(() => {
    if (!uid) return;
    bankedRef.current = 0;
    sessionBaseRef.current = 0;
    runStartedAtRef.current = runningRef.current ? Date.now() : null;

    let cancelled = false;
    getStudyDay(uid, dayKey).then((d) => { if (!cancelled) applyRemote(d); });
    const unsub = watchStudyDay(uid, dayKey, applyRemote);

    return () => { cancelled = true; unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, dayKey]);

  // 1s re-render tick + midnight rollover check. Doesn't accumulate time
  // itself — just forces a re-render so the UI visibly counts up, and
  // checks whether we've crossed into a new day.
  useEffect(() => {
    const id = setInterval(() => {
      const key = dayKeyFor(new Date());
      if (key !== dayKey) {
        if (uid) writeStudyDay(uid, dayKey, Math.floor(liveStopwatch())); // flush the finished day
        bankedRef.current = 0;
        sessionBaseRef.current = 0;
        runStartedAtRef.current = runningRef.current ? Date.now() : null;
        lastLocalWriteRef.current = 0; // new day, new document — old watermark no longer applies
        setDayKey(key);
        return;
      }
      forceTick((n) => n + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [dayKey, uid]);

  // periodic flush to Firestore while running (banks the live wall-clock value)
  useEffect(() => {
    if (!uid) return;
    const id = setInterval(() => {
      if (runningRef.current && Date.now() - flushedAtRef.current > FLUSH_MS) {
        flushedAtRef.current = Date.now();
        writeStudyDay(uid, dayKey, Math.floor(liveStopwatch()));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [uid, dayKey]);

  const toggle = () => {
    setRunning((r) => {
      const next = !r;
      runningRef.current = next;
      if (next) {
        // starting/resuming: mark the real start time of this run
        runStartedAtRef.current = Date.now();
      } else {
        // pausing: bank the real elapsed time and stop tracking a run start
        const banked = Math.floor(liveStopwatch());
        bankedRef.current = banked;
        runStartedAtRef.current = null;
        if (uid) writeStudyDay(uid, dayKey, banked);
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
      if (runningRef.current) writeStudyDay(uid, dayKey, Math.floor(liveStopwatch()));
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
