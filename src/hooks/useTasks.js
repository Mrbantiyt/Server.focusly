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
// useStopwatch already does for the main stopwatch), fixes that: a task
// keeps accumulating elapsed time no matter which tab is currently open.
import { useEffect, useState } from "react";
import { watchTasks, updateTask } from "../lib/firestore";

export function useTasks(uid) {
  const [tasks, setTasks] = useState([]);

  // live sync from Firestore — updates instantly across tabs/devices
  useEffect(() => {
    if (!uid) {
      setTasks([]);
      return;
    }
    return watchTasks(uid, setTasks);
  }, [uid]);

  // local tick for running tasks: bump elapsed every second, flush every ~5s.
  // This effect now lives at the App level, so it survives tab switches.
  useEffect(() => {
    if (!uid) return;
    const id = setInterval(() => {
      tasks.forEach((t) => {
        if (t.running) {
          const next = t.elapsed + 1;
          setTasks((cur) => cur.map((x) => (x.id === t.id ? { ...x, elapsed: next } : x)));
          if (next % 5 === 0) updateTask(uid, t.id, { elapsed: next });
        }
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, uid]);

  return tasks;
}
