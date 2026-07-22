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
// remainingRef.current is a CACHE, not the source of truth. The source of
// truth is endAtRef.current — the absolute wall-clock timestamp (Date.now()
// + remainingSeconds*1000) the countdown is aiming at. Every tick just
// recomputes `remaining = round((endAt - Date.now()) / 1000)` instead of
// decrementing by 1.
//
// THE BUG THIS FIXES: the previous version decremented remainingRef by
// exactly 1 every time the setInterval callback fired, trusting that the
// callback fires once per real second. On a backgrounded tab / screen-off
// phone, browsers and mobile OSes throttle timers heavily (Chrome can drop
// a background tab's interval to ~once/minute; some WebViews suspend it
// almost entirely). The interval doesn't fire more often to catch up — it
// just fires late. So each late firing still only subtracted 1 second, and
// the on-screen countdown fell further and further behind real elapsed
// time. That's the "background/screen-off timer runs but isn't accurate"
// symptom.
//
// Anchoring to an absolute end timestamp fixes this completely: whenever
// the tick DOES fire — whether that's 1s or 90s after the last one — it
// recomputes remaining from Date.now(), so it's instantly correct no
// matter how throttled the interval was. A visibility-change handler also
// forces an immediate recompute + finish-check the moment the app is
// foregrounded again, so the countdown never sits stale until the next
// throttled tick happens to land.
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
// Fix: the full timer state (remaining/running/durationSeconds/bankedToday/
// endAt) is mirrored to localStorage on every tick and restored on mount —
// endAt in particular means a reload mid-countdown recomputes the correct
// remaining time immediately from the restored absolute timestamp, instead
// of resuming a stale tick-count from before the reload. The Firestore
// flush interval is 2s to shrink the loss window for the "Time today" total
// specifically (localStorage covers the gap between flushes; the flush
// interval only bounds how stale the *server-side* copy can get before the
// next save).
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

  // Absolute wall-clock timestamp the countdown is aiming at, in ms
  // (Date.now() + remaining*1000). null when paused/not running. This is
  // the real source of truth for "how much time is left" — remainingRef is
  // just a display cache recomputed from this on every tick. Restored from
  // localStorage on mount so a reload while running doesn't lose the
  // original target time.
  const endAtRef = useRef(
    persisted?.running
      ? (persisted?.endAt ?? Date.now() + (persisted?.remaining ?? 0) * 1000) // fallback for state saved before this fix, which had no endAt field yet
      : null
  );

  // Recomputes remainingRef/setRemaining from the wall clock right now, if
  // running. Returns the fresh remaining value (or remainingRef.current
  // unchanged if not running). Call this instead of touching remainingRef
  // directly whenever "how much time is left" needs to be current.
  const syncRemainingFromClock = () => {
    if (!runningRef.current || !endAtRef.current) return remainingRef.current;
    const fresh = Math.max(0, Math.round((endAtRef.current - Date.now()) / 1000));
    remainingRef.current = fresh;
    return fresh;
  };

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

  // ONE-TIME CATCH-UP ON MOUNT: the clock face self-corrects fine on
  // reload because syncRemainingFromClock() recomputes it from endAtRef —
  // but that correction only happens inside tick(), and tick() only runs
  // once the interval below has actually started, one second AFTER mount.
  // Nothing else recomputes "Time today" for the gap between when this
  // state was last persisted and now.
  //
  // On a native-wrapped WebView, backgrounding/killing the app means the JS
  // runtime — and every tick() call — simply stops running. Reopening the
  // app restarts the runtime fresh, seeding remainingRef/bankedTodayRef
  // from whatever was last written to localStorage before it died: the
  // countdown gets corrected on the next tick, but the seconds that
  // elapsed *while nothing could tick* were never banked to "Time today"
  // and never will be, since bankSeconds is normally only called from
  // inside tick(). That's the exact bug in the reload screenshot: the
  // countdown face jumps to the right remaining time, but "Time today"
  // stays frozen at whatever was banked before the app was backgrounded.
  //
  // Fix: run the same before/after/bankSeconds reconciliation tick() does,
  // once, synchronously on mount — before the user sees anything — so the
  // gap is credited immediately instead of silently dropped.
  const didCatchUpRef = useRef(false);
  useEffect(() => {
    if (didCatchUpRef.current) return;
    didCatchUpRef.current = true;
    if (!runningRef.current || !endAtRef.current) return;

    const before = remainingRef.current;
    const after = syncRemainingFromClock();
    const elapsed = before - after;
    if (elapsed > 0) {
      setRemaining(after);
      bankSeconds(elapsed);
      flushToFirestore(); // don't wait for the next 2s tick to save the recovered time
    }

    if (after <= 0) {
      runningRef.current = false;
      setRunning(false);
      setFinished(true);
      endAtRef.current = null;
    }

    persistState(uid, {
      dayKey,
      running: runningRef.current,
      durationSeconds,
      remaining: remainingRef.current,
      bankedToday: bankedTodayRef.current,
      endAt: endAtRef.current,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flush on tab hide / app backgrounding / unload — covers the case where
  // the periodic 2s interval hasn't fired yet but the user is leaving.
  //
  // IMPORTANT: this must bank the fresh elapsed gap FIRST, then flush —
  // just calling flushToFirestore() alone only saves whatever was already
  // in bankedTodayRef from the last tick, which can be up to ~1s (or more,
  // if the last tick landed late) stale. Since going-to-background is
  // exactly the moment after which no more ticks may ever fire before the
  // OS kills the JS runtime, that last fraction of a second needs to be
  // credited right here, synchronously, before the runtime has any chance
  // of being frozen — waiting for it to reach the next tick is not safe
  // once backgrounding has already started.
  const bankAndFlushBeforeBackground = () => {
    if (runningRef.current && endAtRef.current) {
      const before = remainingRef.current;
      const after = syncRemainingFromClock();
      const elapsed = before - after;
      if (elapsed > 0) {
        setRemaining(after);
        bankSeconds(elapsed);
      }
    }
    flushToFirestore();
    persistNow(); // also refresh the localStorage mirror with the just-banked seconds
  };

  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "hidden") bankAndFlushBeforeBackground(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", bankAndFlushBeforeBackground);
    // "blur" catches app-switch/home-button on some native WebViews that
    // don't reliably fire visibilitychange before the runtime is paused.
    window.addEventListener("blur", bankAndFlushBeforeBackground);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", bankAndFlushBeforeBackground);
      window.removeEventListener("blur", bankAndFlushBeforeBackground);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, dayKey]);

  // The countdown tick. Runs every ~1s while foregrounded, but — unlike a
  // naive decrement-by-1 — it's safe to fire late or be skipped for a
  // while (backgrounded tab, screen off) because it always recomputes
  // "how much time is actually left" from endAtRef (an absolute wall-clock
  // timestamp) rather than trusting the interval's own cadence.
  const tick = () => {
    const key = dayKeyFor(new Date());
    if (key !== dayKey) { setDayKey(key); return; } // fresh day: let the load effect above pick up the new doc

    if (!runningRef.current || !endAtRef.current) return;

    const before = remainingRef.current;
    const after = syncRemainingFromClock();
    const elapsed = before - after; // however many real seconds actually passed since the last sync — often 1, but can be many after a throttled gap
    if (elapsed > 0) {
      setRemaining(after);
      bankSeconds(elapsed); // credit the real elapsed time to "Time today", not just 1s, so a throttled background gap is never silently lost
    }

    if (after <= 0) {
      runningRef.current = false;
      setRunning(false);
      setFinished(true);
      endAtRef.current = null;
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
      endAt: endAtRef.current,
    });
  };

  useEffect(() => {
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey, uid, durationSeconds]);

  // Force an immediate resync the moment the app/tab is foregrounded again,
  // instead of waiting for the next (possibly still-throttled-for-a-moment)
  // interval tick. This is what makes "screen off, then back on" show the
  // correct remaining time instantly rather than a stale number that only
  // catches up a second later.
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      endAt: endAtRef.current,
    });
  };

  // Sets a new duration. Only allowed while paused, so it can't stomp on a
  // countdown in progress.
  const setDuration = (totalSeconds) => {
    if (runningRef.current) return;
    const clamped = Math.max(0, Math.floor(totalSeconds));
    setDurationSeconds(clamped);
    remainingRef.current = clamped;
    endAtRef.current = null; // only settable while paused, so there's no running end target to update
    setRemaining(clamped);
    setFinished(false);
    persistState(uid, { dayKey, running: false, durationSeconds: clamped, remaining: clamped, bankedToday: bankedTodayRef.current, endAt: null });
  };

  const start = () => {
    if (remainingRef.current <= 0) return; // nothing to run — set a duration first
    setFinished(false);
    runningRef.current = true;
    setRunning(true);
    // Anchor the countdown to an absolute end timestamp based on however
    // much time is left right now — this is what makes the countdown
    // immune to throttled/late ticks while backgrounded.
    endAtRef.current = Date.now() + remainingRef.current * 1000;
    // Ask the server to push a "timer complete" notification after however
    // many seconds are left right now, so the alert still reaches the user
    // if they background or close the app before it finishes.
    scheduleTimerNotification(remainingRef.current);
    persistNow();
  };

  const pause = () => {
    // Bank whatever's actually elapsed since the last tick, up to this
    // exact moment, before freezing the clock — otherwise a pause that
    // lands between ticks would silently drop up to ~1s (or more, if the
    // last tick was itself delayed) of genuinely-elapsed time.
    const before = remainingRef.current;
    const after = syncRemainingFromClock();
    const elapsed = before - after;
    if (elapsed > 0) bankSeconds(elapsed);
    setRemaining(after);
    runningRef.current = false;
    setRunning(false);
    endAtRef.current = null;
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
    endAtRef.current = null;
    remainingRef.current = durationSeconds;
    setRemaining(durationSeconds);
    setFinished(false);
    cancelTimerNotification();
    flushToFirestore();
    persistNow();
  };

  // Credits seconds from an OTHER running clock (the Custom/Subject Timer)
  // into this same "Time today" bank, so total daily study time reflects
  // both timers combined. Reuses the same bankSeconds/flush machinery — it
  // does not touch remaining/durationSeconds/running, which belong solely
  // to the Study Timer's own countdown.
  const creditExternalSeconds = (sec) => {
    bankSeconds(sec);
    persistState(uid, {
      dayKey,
      running: runningRef.current,
      durationSeconds,
      remaining: remainingRef.current,
      bankedToday: bankedTodayRef.current,
    });
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
    creditExternalSeconds,
  };
}
