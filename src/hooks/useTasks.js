// src/hooks/useTasks.js
//
// Previously this ticking interval lived inside Tasks.jsx. That component
// is only mounted while the "tasks" tab is active (see App.jsx), so the
// moment you switched to Home/Chat/Calendar/Settings, the interval was
// destroyed and any running task's elapsed time simply stopped counting —
// even though its `running: true` flag stayed true in Firestore.
//
// Moving both the task list and the tick loop up here, into a hook used by
// App.jsx (which stays mounted for the whole session, exactly like
// useStopwatch already does for the main stopwatch), fixed that first bug.
//
// SECOND BUG (fixed now): every periodic flush wrote the freshly-computed
// `elapsed` to Firestore but left `startedAt` untouched. `onSnapshot` then
// echoed that doc back down, and the next `liveElapsed` call computed
// `elapsed + (Date.now() - startedAt) / 1000` — but `Date.now() - startedAt`
// already covered the SAME run time that had just been folded into
// `elapsed`, so it got added again on top of itself. Each flush cycle
// compounded this, which is why the timer looked like it was leaping ahead
// (e.g. 4s -> 11s, 14s -> 25s) instead of counting up smoothly.
//
// The fix (mirroring useStopwatch.js, which never had this bug): keep the
// banked total and run-start timestamp in local refs that are the single
// source of truth for display. Every time we flush/bank elapsed time,
// `startedAt` is re-stamped to "now" in the same breath — locally AND in
// the Firestore write — so the next computation starts counting from zero
// run-time again instead of double-adding what was just banked. Remote
// snapshots are only applied if they don't fight an in-progress local run.
import { useEffect, useRef, useState } from "react";
import { watchTasks, updateTask, runMidnightTaskReset } from "../lib/firestore";
import { dayKeyFor, msUntilNextReset } from "../lib/time";

const FLUSH_MS = 5000;

export function useTasks(uid) {
  const [tasks, setTasks] = useState([]);
  const [, forceTick] = useState(0);

  // Per-task local run state, keyed by task id — the source of truth for
  // any task that's actively running, exactly like bankedRef/runStartedAtRef
  // in useStopwatch.js. { banked, runStartedAt, flushedAt }
  const runStateRef = useRef({});
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const liveElapsed = (t) => {
    const rs = runStateRef.current[t.id];
    if (!t.running || !rs || !rs.runStartedAt) return t.elapsed || 0;
    const ranSec = Math.max(0, (Date.now() - rs.runStartedAt) / 1000);
    return rs.banked + ranSec;
  };

  // Tasks are a DAILY list: every local midnight, today's tasks are wiped
  // (after crediting their completion counts into taskStats — see
  // runMidnightTaskReset). This runs once immediately on mount, which
  // covers "app was closed overnight and just reopened after midnight",
  // and then re-arms itself for the next exact midnight boundary while the
  // app stays open, so a session spanning midnight also gets reset live
  // instead of only on next app launch.
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    let timeoutId;

    const runAndReschedule = () => {
      if (cancelled) return;
      runMidnightTaskReset(uid, dayKeyFor(new Date())).catch(() => {
        // Non-fatal: if this fails (e.g. offline), the next mount or the
        // next midnight timer will simply try again.
      });
      timeoutId = setTimeout(runAndReschedule, msUntilNextReset() + 1000);
    };

    runAndReschedule();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [uid]);

  // live sync from Firestore — updates instantly across tabs/devices
  useEffect(() => {
    if (!uid) {
      setTasks([]);
      runStateRef.current = {};
      return;
    }
    return watchTasks(uid, (incoming) => {
      // Reconcile local run state against the incoming docs. A task that
      // just started running (or resumed) on THIS or another device gets a
      // fresh runStartedAt stamped now; the doc's `elapsed` becomes the new
      // banked base. A task that stopped running has its local run state
      // cleared so liveElapsed falls back to the plain stored value.
      const next = { ...runStateRef.current };
      incoming.forEach((t) => {
        const rs = next[t.id];
        if (t.running) {
          if (!rs) {
            // just started running (locally or remotely) — begin a fresh run
            next[t.id] = { banked: t.elapsed || 0, runStartedAt: Date.now(), flushedAt: Date.now() };
          }
          // else: already tracking this run locally — keep counting from
          // our own runStartedAt; don't let a late-arriving echo of our own
          // flush reset it and don't double count.
        } else {
          delete next[t.id];
        }
      });
      runStateRef.current = next;
      setTasks(incoming);
    });
  }, [uid]);

  // 1s re-render tick + periodic flush. Flushing banks the live elapsed
  // value into Firestore AND re-stamps this task's local runStartedAt/banked
  // to the same instant, so the next tick starts measuring a fresh run
  // instead of re-adding time that's already been counted.
  useEffect(() => {
    if (!uid) return;
    const id = setInterval(() => {
      forceTick((n) => n + 1);
      const now = Date.now();
      Object.keys(runStateRef.current).forEach((taskId) => {
        const rs = runStateRef.current[taskId];
        if (!rs || now - rs.flushedAt < FLUSH_MS) return;
        const banked = Math.floor(rs.banked + Math.max(0, (now - rs.runStartedAt) / 1000));
        runStateRef.current[taskId] = { banked, runStartedAt: now, flushedAt: now };
        updateTask(uid, taskId, { elapsed: banked, startedAt: now });
      });
    }, 1000);
    return () => clearInterval(id);
  }, [uid]);

  // Also flush immediately when the app is about to go to the background or
  // the screen locks, and again the moment it comes back — this both saves
  // the freshest value before any throttling kicks in, and makes sure the
  // UI snaps to the correct real elapsed time as soon as the tab is visible
  // again instead of waiting for the next 1s tick.
  useEffect(() => {
    if (!uid) return;
    const flushRunning = () => {
      const now = Date.now();
      Object.keys(runStateRef.current).forEach((taskId) => {
        const rs = runStateRef.current[taskId];
        if (!rs) return;
        const banked = Math.floor(rs.banked + Math.max(0, (now - rs.runStartedAt) / 1000));
        runStateRef.current[taskId] = { banked, runStartedAt: now, flushedAt: now };
        updateTask(uid, taskId, { elapsed: banked, startedAt: now });
      });
    };
    const onVisibility = () => {
      forceTick((n) => n + 1); // snap the UI to the real elapsed time right away
      if (document.visibilityState === "hidden") flushRunning();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", flushRunning);
    window.addEventListener("pagehide", flushRunning);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", flushRunning);
      window.removeEventListener("pagehide", flushRunning);
    };
  }, [uid]);

  // Expose tasks with their elapsed field live-computed from local run
  // state, so every consumer (Tasks.jsx, Dashboard, etc.) just reads
  // `task.elapsed` as always and gets the real, up-to-the-second value —
  // without ever double-counting a run that's already been banked.
  const liveTasks = tasks.map((t) => (t.running ? { ...t, elapsed: liveElapsed(t) } : t));

  return liveTasks;
}
