// src/hooks/useStopwatch.js
import { useEffect, useRef, useState } from "react";
import { dayKeyFor } from "../lib/time";
import { getStudyDay, setStudyDay, watchStudyDay } from "../lib/firestore";

// Writes to Firestore aren't cheap if done every second, so we tick locally
// every 1s for a smooth UI, and flush the real value to Firestore every
// FLUSH_MS, plus immediately on pause / tab close / day rollover.
const FLUSH_MS = 8000;

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
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const flushedAtRef = useRef(0);

  // load today's value once, then keep listening for cross-device changes
  useEffect(() => {
    if (!uid) return;
    let unsub = () => {};
    getStudyDay(uid, dayKey).then((s) => {
      setTodaySeconds(s);
      setDisplaySeconds(s);
    });
    unsub = watchStudyDay(uid, dayKey, (s) => {
      // don't fight with our own local ticking — only accept remote value
      // if it's meaningfully ahead (e.g. same account open on another device)
      setTodaySeconds((cur) => (s > cur ? s : cur));
    });
    return unsub;
  }, [uid, dayKey]);

  // local 1s tick + midnight rollover check
  useEffect(() => {
    const id = setInterval(() => {
      const key = dayKeyFor(new Date());
      if (key !== dayKey) {
        if (uid) setStudyDay(uid, dayKey, todaySeconds); // flush the finished day
        setDayKey(key);
        setTodaySeconds(0);   // auto-reset right after midnight
        setDisplaySeconds(0); // stopwatch face resets too for the new day
        return;
      }
      if (running) {
        setTodaySeconds((s) => s + 1);
        setDisplaySeconds((s) => s + 1);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [running, dayKey, uid, todaySeconds]);

  // periodic + on-pause flush to Firestore
  useEffect(() => {
    if (!uid) return;
    const id = setInterval(() => {
      if (running && Date.now() - flushedAtRef.current > FLUSH_MS) {
        flushedAtRef.current = Date.now();
        setStudyDay(uid, dayKey, todaySeconds);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [running, todaySeconds, uid, dayKey]);

  const toggle = () => {
    setRunning((r) => {
      const next = !r;
      if (!next && uid) setStudyDay(uid, dayKey, todaySeconds); // flush on pause
      return next;
    });
  };

  // Flush immediately if the tab goes to background or closes while running,
  // so switching apps / locking the phone never loses unsaved seconds.
  useEffect(() => {
    if (!uid) return;
    const flushNow = () => {
      if (running) setStudyDay(uid, dayKey, todaySeconds);
    };
    document.addEventListener("visibilitychange", flushNow);
    window.addEventListener("beforeunload", flushNow);
    window.addEventListener("pagehide", flushNow);
    return () => {
      document.removeEventListener("visibilitychange", flushNow);
      window.removeEventListener("beforeunload", flushNow);
      window.removeEventListener("pagehide", flushNow);
    };
  }, [uid, dayKey, todaySeconds, running]);

  // Zeroes only the stopwatch FACE. "Time today" (todaySeconds) is untouched
  // and keeps counting in the background — it only resets at midnight.
  const reset = () => setDisplaySeconds(0);

  return { seconds: displaySeconds, todaySeconds, running, toggle, reset, dayKey };
}
