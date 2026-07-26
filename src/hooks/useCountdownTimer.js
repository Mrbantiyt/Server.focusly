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
// Separate from STORAGE_KEY_PREFIX: that key mirrors the CURRENT day's live
// countdown state and is intentionally discarded once its dayKey is stale
// (see loadPersistedState below) — a new day starts the countdown fresh.
// This queue is different: it holds seconds that were banked but NEVER
// confirmed written to Firestore, keyed by calendar day. It survives day
// rollovers, app restarts, and uid switches (each uid's queue is separate)
// specifically so a failed sync from yesterday is never silently dropped
// just because today started. Each entry carries a unique sessionId so a
// retry can never be double-applied even if the same entry gets synced
// twice (e.g. two tabs racing) — see syncPendingQueue's duplicate guard.
const QUEUE_KEY_PREFIX = "focusly:pendingStudySeconds:";

function loadQueue(uid) {
  if (!uid) return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY_PREFIX + uid);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueue(uid, queue) {
  if (!uid) return;
  try {
    if (queue.length === 0) localStorage.removeItem(QUEUE_KEY_PREFIX + uid);
    else localStorage.setItem(QUEUE_KEY_PREFIX + uid, JSON.stringify(queue));
  } catch {
    // Storage full/unavailable — non-fatal, same reasoning as persistState.
  }
}

// Queues `seconds` (an ABSOLUTE day-total, same shape setStudyDay expects)
// for `dayKey`, tagged with a unique sessionId, so it can be retried later
// even across a day rollover or app restart. If an entry for the same
// dayKey already exists, it's replaced (not appended) — we only ever need
// to remember the LATEST known-good total per day, not a history of every
// intermediate value that failed to sync.
function enqueuePending(uid, dayKey, seconds) {
  if (!uid) return;
  const queue = loadQueue(uid).filter((e) => e.dayKey !== dayKey);
  queue.push({ sessionId: `${dayKey}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, dayKey, seconds, queuedAt: Date.now() });
  saveQueue(uid, queue);
}

function loadPersistedState(uid) {
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + uid);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Ignore state from a previous calendar day — a new day starts fresh.
    // NOTE: this is safe to discard outright (unlike the queue above)
    // because any seconds it represented were already merged into the
    // pending-sync queue by the day-rollover handling in tick()/the mount
    // effect before this check would ever see a stale dayKey matter.
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

// ---------------------------------------------------------------------------
// Idempotent session completion tracking
// ---------------------------------------------------------------------------
// Each countdown run (from start() to either pause()/reset() or hitting 0)
// gets a unique sessionId, generated once in start() and carried through
// localStorage alongside the rest of the timer state. See
// hooks/timerSessionCredit.js for the full reasoning on why this is needed
// on top of App.jsx's in-memory sessionCreditedRef.
import { makeSessionId, hasSessionBeenCredited, markSessionCredited } from "./timerSessionCredit";
const SESSION_KIND = "studyTimer";

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
  // Unique id for the CURRENT countdown run — see the "Idempotent session
  // completion tracking" comment above. Generated fresh in start(); carried
  // across reloads via persisted state so a session that finishes while the
  // app is closed still resolves to the same id once restored, and its
  // completion can be recognized as "already credited" on any later remount.
  const sessionIdRef = useRef(persisted?.sessionId || null);

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

  // Drains the durable cross-day pending-sync queue (see enqueuePending
  // above) — retries writing each queued day's last-known seconds total to
  // Firestore, and only removes an entry from the queue once its write is
  // CONFIRMED successful. Runs once on mount (catches anything left over
  // from a previous session that never got to sync — app crash, browser
  // closed while offline, etc.) and again every time the browser regains
  // connectivity, so a genuinely offline session syncs automatically the
  // moment the network comes back, with no user action needed.
  //
  // Each queued entry is an ABSOLUTE seconds total for its day (not a
  // delta), and setStudyDay's transaction is itself idempotent for a given
  // (day, value) pair — replaying the same write twice (e.g. this queue
  // AND the live flushToFirestore both eventually writing the same day) is
  // therefore always safe and can never double-count.
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;

    const syncPendingQueue = async () => {
      const queue = loadQueue(uid);
      if (queue.length === 0) return;
      const remaining = [];
      for (const entry of queue) {
        if (cancelled) { remaining.push(entry); continue; }
        try {
          await setStudyDay(uid, entry.dayKey, entry.seconds);
          // Confirmed synced — drop it from the queue (don't push to remaining).
        } catch (err) {
          console.warn(`[timer] Retry failed for queued session ${entry.sessionId}, will retry again later:`, err);
          remaining.push(entry); // keep it queued, try again next time
        }
      }
      if (!cancelled) saveQueue(uid, remaining);
    };

    syncPendingQueue();
    window.addEventListener("online", syncPendingQueue);
    return () => {
      cancelled = true;
      window.removeEventListener("online", syncPendingQueue);
    };
  }, [uid]);

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
  const retryCountRef = useRef(0);
  const backoffUntilRef = useRef(0);

  // Returns a Promise that resolves once the CURRENT bankedTodayRef value is
  // confirmed written to Firestore (or gives up after retries, but never
  // throws — callers that need "definitely saved before we do X" should
  // still `await` this, since it always resolves).
  //
  // Retries with exponential backoff (1s, 2s, 4s, capped at 30s) on failure,
  // instead of silently relying on the next periodic tick — the periodic
  // 2s interval below is now purely a safety net for picking up NEW banked
  // seconds, not the retry mechanism for a failed write.
  const flushToFirestore = () => {
    if (!uid) return Promise.resolve();
    if (flushInFlightRef.current) {
      // A flush is already in progress. Don't start a second one (that's
      // what caused the write-reordering bug described above) — just mark
      // that there's more to send and let the in-flight one's completion
      // (or the next periodic tick) pick it up.
      pendingFlushRef.current = true;
      return Promise.resolve();
    }
    if (!pendingFlushRef.current) return Promise.resolve();

    flushInFlightRef.current = true;
    pendingFlushRef.current = false;
    const valueAtFlushTime = bankedTodayRef.current;

    return setStudyDay(uid, dayKey, valueAtFlushTime)
      .then(() => {
        retryCountRef.current = 0;
      })
      .catch((err) => {
        console.warn("[timer] Failed to save today's time, will retry:", err);
        pendingFlushRef.current = true; // retry on the next flush tick
        retryCountRef.current += 1;
        // Exponential backoff: skip the next N periodic ticks so we don't
        // hammer Firestore while it (or the network) is down. The periodic
        // 2s interval keeps firing regardless; this just makes it a no-op
        // until backoffUntilRef passes.
        const delayMs = Math.min(30000, 1000 * 2 ** Math.min(retryCountRef.current, 5));
        backoffUntilRef.current = Date.now() + delayMs;
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
    const id = setInterval(() => {
      if (Date.now() < backoffUntilRef.current) return; // still in backoff after a recent failure
      flushToFirestore();
    }, 2000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, dayKey]);

  // Flush on tab hide / app backgrounding / unload — covers the case where
  // the periodic 5s interval hasn't fired yet but the user is leaving.
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "hidden") flushToFirestore(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushToFirestore);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushToFirestore);
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
    if (key !== dayKey) {
      // Midnight rollover mid-tick. If there's still an unconfirmed flush
      // pending for the day that just ended (a write in flight, in
      // backoff after a failure, or simply not due yet), queue its last
      // known value durably (survives across the rollover / an app
      // restart) instead of letting it be silently superseded once
      // `dayKey` flips and every subsequent flush targets the NEW day's
      // doc. syncPendingQueue (run on next mount / online) retries it
      // independently of whatever the countdown is doing today.
      if (pendingFlushRef.current || flushInFlightRef.current) {
        enqueuePending(uid, dayKey, bankedTodayRef.current);
      }
      setDayKey(key);
      return;
    } // fresh day: let the load effect above pick up the new doc

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
      // THE ROOT CAUSE THIS FIXES: bankSeconds() above already credited the
      // final elapsed seconds to bankedTodayRef/todaySeconds (in-memory +
      // React state), but only marked pendingFlushRef true — the actual
      // Firestore write was left to the next periodic 2s flush tick, same
      // as any other tick. Every OTHER "stop counting" path (pause, reset,
      // tab-hide, unload) explicitly calls flushToFirestore() right away;
      // this natural-completion path was the one spot that didn't. If the
      // user refreshed, closed the tab, or the app was killed inside that
      // up-to-2-second window right after a session finished — a moment
      // people very commonly do exactly that, to go check the dashboard —
      // the just-earned seconds were never persisted and vanished on
      // reload. Flushing immediately here (not waiting for the interval)
      // closes that window down to 0.
      flushToFirestore();
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
      sessionId: sessionIdRef.current,
    });
  };

  useEffect(() => {
    // Resync immediately on mount too — not just on the first interval tick
    // a second later. A restored/reloaded app (localStorage state pulled
    // back in with a stale `remaining`/fresh `endAt`) would otherwise show
    // the old cached remaining time, and more importantly leave that gap's
    // elapsed seconds unbanked, until the next timer/visibility event fires.
    // On a native WebView that got reclaimed and reloaded while backgrounded,
    // that event may never come, so this call is what actually closes the
    // gap in "Time today" right at startup.
    tick();
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
      sessionId: sessionIdRef.current,
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
    // A new duration means whatever session existed before (if any) is
    // done being configured — clear sessionId so the NEXT start() mints a
    // fresh one rather than reusing an old, possibly-already-credited id.
    sessionIdRef.current = null;
    persistState(uid, { dayKey, running: false, durationSeconds: clamped, remaining: clamped, bankedToday: bankedTodayRef.current, endAt: null, sessionId: null });
  };

  const start = () => {
    if (remainingRef.current <= 0) return; // nothing to run — set a duration first
    setFinished(false);
    runningRef.current = true;
    setRunning(true);
    // Mint a fresh session id only when starting a NEW run (no session id
    // carried over) — resuming after a pause (sessionIdRef already set)
    // keeps the same id, since it's still the same logical study session
    // continuing, not a new one.
    if (!sessionIdRef.current) sessionIdRef.current = makeSessionId();
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
    // Whatever session was running/just finished is done — clear its id so
    // pressing Start again begins a genuinely new session with a fresh id,
    // not a resumed/duplicate-credited one.
    sessionIdRef.current = null;
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
      endAt: endAtRef.current,
      sessionId: sessionIdRef.current,
    });
  };

  // Idempotent completion-credit helpers for the caller (App.jsx). See the
  // "Idempotent session completion tracking" comment near the top of this
  // file for the full reasoning — in short: `finished` alone isn't safe to
  // key a one-time XP/coins award off of, because it can still read `true`
  // across repeated reloads of the same completed-but-not-yet-reset
  // session. sessionId identifies WHICH session is finished; these two
  // functions let the caller ask "have I already paid out for this one?"
  // and record "I just did", both backed by localStorage so the check
  // survives a refresh even though React state (a ref in App.jsx) doesn't.
  const isCurrentSessionCredited = () => hasSessionBeenCredited(SESSION_KIND, uid, sessionIdRef.current);
  const markCurrentSessionCredited = () => markSessionCredited(SESSION_KIND, uid, sessionIdRef.current);

  return {
    remaining,          // seconds left on the countdown
    durationSeconds,     // the currently-set total duration in seconds
    running,
    finished,            // true right after the countdown hits 0, until reset/new duration
    todaySeconds,        // "Time today" total (seconds), same meaning as the old stopwatch's todaySeconds
    sessionId: sessionIdRef.current, // stable id for the current/just-finished run — see idempotent credit helpers below
    isCurrentSessionCredited,
    markCurrentSessionCredited,
    setDuration,
    start,
    pause,
    toggle,
    reset,
    dayKey,
    creditExternalSeconds,
  };
}
