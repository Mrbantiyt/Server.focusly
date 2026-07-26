// src/hooks/timerSessionCredit.js
//
// Shared by useCountdownTimer.js (Study Timer) and useSubjectTimer.js
// (Custom/multi-subject Timer) — both timers can independently finish a
// "session" (a completed countdown, or a completed multi-subject plan) that
// should credit sessionsCompleted / XP / coins exactly once.
//
// THE BUG THIS PREVENTS: an in-memory-only "have I credited this yet" ref
// in App.jsx is NOT enough on its own. If a timer finishes while the app is
// closed, the next mount's tick() correctly sets `finished=true` and credits
// once. But if the user then refreshes AGAIN while still looking at the
// "session complete" screen (finished still true, Reset not yet pressed),
// the fresh page load's in-memory ref starts back at `false` — a ref can't
// survive a reload — so without a persisted check, that second reload would
// credit the exact same completed session a second time (duplicate
// sessionsCompleted / XP / coins).
//
// The fix: every timer run gets a unique, stable sessionId (minted once by
// the timer hook's start(), carried through localStorage across reloads).
// Completion-crediting is keyed off "has THIS sessionId already been
// credited?", persisted here, so the check survives any number of refreshes
// independent of React state.
//
// Each timer type gets its own localStorage key (namespaced by `kind`) so a
// Study Timer session id and a Subject Timer session id can never collide
// even in the extremely unlikely case they generated the same random
// suffix.
const MAX_CREDITED_HISTORY = 20;

function storageKey(kind, uid) {
  return `focusly:creditedSessions:${kind}:${uid}`;
}

export function makeSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function hasSessionBeenCredited(kind, uid, sessionId) {
  if (!uid || !sessionId) return false;
  try {
    const raw = localStorage.getItem(storageKey(kind, uid));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) && list.includes(sessionId);
  } catch {
    return false;
  }
}

export function markSessionCredited(kind, uid, sessionId) {
  if (!uid || !sessionId) return;
  try {
    const raw = localStorage.getItem(storageKey(kind, uid));
    const list = raw ? JSON.parse(raw) : [];
    const next = (Array.isArray(list) ? list : []).filter((id) => id !== sessionId);
    next.push(sessionId);
    // Only the last few ids are kept — we only ever need to answer "was
    // THIS specific still-visible finished session already credited", not
    // maintain permanent history.
    while (next.length > MAX_CREDITED_HISTORY) next.shift();
    localStorage.setItem(storageKey(kind, uid), JSON.stringify(next));
  } catch {
    // non-fatal — worst case a very rare double-credit on repeated
    // refreshes if storage is unavailable, same tradeoff as everywhere
    // else in this app that mirrors state to localStorage.
  }
}
