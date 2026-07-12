// src/hooks/useLeaderboard.js
import { useEffect, useRef, useState } from "react";
import { syncLeaderboardEntry, watchLeaderboard } from "../lib/firestore";

// Keeps two things going:
// 1) Syncs the signed-in user's own leaderboard/{uid} mirror doc (username,
//    lifetime study seconds, streak, level) whenever those values change —
//    so their rank stays current without a dedicated write path elsewhere.
// 2) Live-watches the top N rows across all users, sorted by
//    totalStudySeconds, for rendering the ranked list.
//
// `enabled` lets the caller mount this only while the Leaderboard page is
// actually open, so we're not running an always-on cross-user listener for
// the whole app session.
export function useLeaderboard(uid, { username, totalStudySeconds, streak, level }, enabled) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const lastSyncedRef = useRef(null);

  // Sync this user's own entry. Runs independently of `enabled` — a user's
  // rank should stay fresh even if they never open the Leaderboard page
  // themselves, since other people's views of the list depend on it.
  useEffect(() => {
    if (!uid) return;
    const key = `${username || ""}:${totalStudySeconds || 0}:${streak || 0}:${level || 0}`;
    if (lastSyncedRef.current === key) return;
    lastSyncedRef.current = key;
    syncLeaderboardEntry(uid, { username, totalStudySeconds, streak, level });
  }, [uid, username, totalStudySeconds, streak, level]);

  // Watch the ranked list only while enabled (i.e. the page is open).
  useEffect(() => {
    if (!enabled) { setRows([]); setLoading(true); return; }
    setLoading(true);
    const unsub = watchLeaderboard((list) => {
      setRows(list);
      setLoading(false);
    }, 50);
    return () => unsub();
  }, [enabled]);

  return { rows, loading };
}
