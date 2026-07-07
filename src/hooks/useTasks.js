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
// TASK TIME -> "Time today":
// Whatever a task actually ran *today* also needs to count toward the
// Dashboard's "Time today" (alongside the Study Stopwatch). A task's own
// `elapsed` field is a lifetime total across however many days it's been
// worked on, so we can't just add all of it in — only the portion that ran
// today should count. We track that with a per-session cursor
// (sessionFlushedRef, one entry per task id): each time we flush, we send
// Firestore only the *delta* since the last flush for that run, via
// addTaskSeconds's atomic increment. A fresh run (new startedAt) resets
// that task's cursor to 0, and pausing/completing sends one final delta
// covering right up to the moment it stopped. If the day rolls over while
// a task is still running, its cursor also resets so the new day starts
// counting today's task time from zero.
import { useEffect, useRef, useState } from "react";
import { watchTasks, updateTask, addTaskSeconds } from "../lib/firestore";
import { dayKeyFor } from "../lib/time";

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

  // For each currently-running task id: how many of its *today* seconds
  // have already been flushed into studyDays.taskSeconds, keyed by that
  // run's startedAt (so a fresh start/resume always begins a new count).
  const flushedRef = useRef({}); // { [taskId]: { startedAt, sentSeconds } }
  const dayKeyRef = useRef(dayKeyFor(new Date()));

  // live sync from Firestore — updates instantly across tabs/devices
  useEffect(() => {
    if (!uid) {
      setTasks([]);
      return;
    }
    return watchTasks(uid, setTasks);
  }, [uid]);

  // Sends the delta of *this run's* elapsed time (since the run's own
  // startedAt, capped to what's happened since the last flush) to today's
  // studyDay.taskSeconds, and advances the cursor. No-ops for tasks that
  // aren't running or whose run started before today (nothing "today" to
  // credit until the day rolls over naturally via dayKeyRef).
  const flushTaskToToday = (t, todayKey) => {
    if (!t.running || !t.startedAt) return;
    const cursor = flushedRef.current[t.id];
    const freshRun = !cursor || cursor.startedAt !== t.startedAt;
    if (freshRun) {
      flushedRef.current[t.id] = { startedAt: t.startedAt, sentSeconds: 0 };
    }
    const startedAtKey = dayKeyFor(new Date(t.startedAt));
    // Only count time from the point "today" began: if the run started
    // before today (carried over from before midnight), credit only the
    // portion since local midnight, not the whole run.
    const runStart = startedAtKey === todayKey ? t.startedAt : new Date(new Date().setHours(0, 0, 0, 0)).getTime();
    const totalTodaySoFar = Math.max(0, (Date.now() - runStart) / 1000);
    const c = flushedRef.current[t.id];
    const delta = Math.floor(totalTodaySoFar) - Math.floor(c.sentSeconds);
    if (delta > 0) {
      c.sentSeconds += delta;
      addTaskSeconds(uid, todayKey, delta);
    }
  };

  // Re-render every second so running tasks visibly count up, flush the
  // recomputed real elapsed time onto the task doc every ~5s, and flush
  // today's share of running-task time into studyDays.taskSeconds.
  useEffect(() => {
    if (!uid) return;
    const id = setInterval(() => {
      forceTick((n) => n + 1);
      const todayKey = dayKeyFor(new Date());
      if (todayKey !== dayKeyRef.current) {
        // Midnight rolled over while task(s) were running: reset cursors so
        // the new day starts counting from zero for still-running tasks.
        dayKeyRef.current = todayKey;
        flushedRef.current = {};
      }
      tasksRef.current.forEach((t) => {
        if (t.running && t.startedAt) {
          const next = Math.floor(liveElapsed(t));
          if (next !== t.elapsed && next % 5 === 0) {
            updateTask(uid, t.id, { elapsed: next });
          }
          flushTaskToToday(t, dayKeyRef.current);
        }
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // Also flush immediately when the app is about to go to the background or
  // the screen locks, and again the moment it comes back — this both saves
  // the freshest value before any throttling kicks in, and makes sure the
  // UI snaps to the correct real elapsed time as soon as the tab is visible
  // again instead of waiting for the next 1s tick.
  useEffect(() => {
    if (!uid) return;
    const flushRunning = () => {
      const todayKey = dayKeyFor(new Date());
      tasksRef.current.forEach((t) => {
        if (t.running && t.startedAt) {
          updateTask(uid, t.id, { elapsed: Math.floor(liveElapsed(t)) });
          flushTaskToToday(t, todayKey);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // Expose tasks with their elapsed field live-computed from startedAt, so
  // every consumer (Tasks.jsx, Dashboard, etc.) just reads `task.elapsed`
  // as always and gets the real, up-to-the-second value for free.
  const liveTasks = tasks.map((t) => (t.running ? { ...t, elapsed: liveElapsed(t) } : t));

  // Callers (Tasks.jsx) call this right when they pause/complete a task,
  // so the exact final second is credited to today immediately instead of
  // waiting for the next 1s interval tick.
  const flushTaskNow = (taskId) => {
    const t = tasksRef.current.find((x) => x.id === taskId);
    if (t) flushTaskToToday(t, dayKeyFor(new Date()));
  };

  return { tasks: liveTasks, flushTaskNow };
}
