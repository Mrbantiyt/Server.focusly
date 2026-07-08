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
// BUT: counting via `setInterval` ticks is still fundamentally fragile —
// mobile browsers/webviews throttle or fully suspend JS timers once the
// screen turns off or the app goes to the background (to save battery), so
// a plain "add 1 every 1000ms" loop simply stops accumulating for however
// long the screen was off, even though the interval itself is still alive
// in memory.
//
// The fix: don't count ticks — measure real elapsed wall-clock time.
// Each running task stores `startedAt` (a Date.now() epoch ms, set once
// when the task is started/resumed). At any moment, the *true* elapsed
// time is `elapsed + (Date.now() - startedAt) / 1000`, regardless of how
// many timer ticks actually fired in between. The 1s interval below is now
// only responsible for re-rendering the display and flushing to Firestore
// periodically — even if it's throttled and only fires once every 30s
// after the screen comes back on, it recomputes the correct total from the
// timestamp difference, so no time is ever lost.
//
// NOTE: a task's own elapsed time is tracked entirely independently of the
// Study Stopwatch / "Time today" on the Dashboard — running a task timer
// does NOT add to "Time today". These are two intentionally separate
// numbers.
import { useEffect, useRef, useState } from "react";
import { watchTasks, updateTask } from "../lib/firestore";

// Real elapsed seconds for a task right now, whether it's running or not.
function liveElapsed(t) {
  if (!t.running || !t.startedAt) return t.elapsed || 0;
  const ranMs = Date.now() - t.startedAt;
  return (t.elapsed || 0) + Math.max(0, ranMs / 1000);
}

export function useTasks(uid) {
  const [tasks, setTasks] = useState([]);
  const [, forceTick] = useState(0);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  // live sync from Firestore — updates instantly across tabs/devices
  useEffect(() => {
    if (!uid) {
      setTasks([]);
      return;
    }
    return watchTasks(uid, setTasks);
  }, [uid]);

  // Re-render every second so running tasks visibly count up. Flushing to
  // Firestore now runs on its own counter instead of checking
  // `next % 5 === 0` — that check depended on a tick landing on an exact
  // multiple of 5, but wall-clock-driven ticks drift and skip values, so it
  // could go many seconds without writing, then write a much larger number
  // all at once. The Firestore round-trip (write, then onSnapshot echoing it
  // back into `tasks`) would then overwrite the smooth locally-computed
  // display with that stale/late value, producing the visible
  // "freeze then jump" stutter. `liveTasks` below always recomputes the
  // running task's displayed value from `startedAt` rather than trusting
  // whatever `elapsed` last came back from Firestore, so the round trip can
  // never visibly move the number backwards or skip it forwards.
  useEffect(() => {
    if (!uid) return;
    let msSinceFlush = 0;
    const id = setInterval(() => {
      forceTick((n) => n + 1);
      msSinceFlush += 1000;
      if (msSinceFlush >= 5000) {
        msSinceFlush = 0;
        tasksRef.current.forEach((t) => {
          if (t.running && t.startedAt) {
            updateTask(uid, t.id, { elapsed: Math.floor(liveElapsed(t)) });
          }
        });
      }
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
      tasksRef.current.forEach((t) => {
        if (t.running && t.startedAt) {
          updateTask(uid, t.id, { elapsed: Math.floor(liveElapsed(t)) });
        }
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

  // Expose tasks with their elapsed field live-computed from startedAt, so
  // every consumer (Tasks.jsx, Dashboard, etc.) just reads `task.elapsed`
  // as always and gets the real, up-to-the-second value for free.
  const liveTasks = tasks.map((t) => (t.running ? { ...t, elapsed: liveElapsed(t) } : t));

  return liveTasks;
}
