// src/hooks/useNotes.js
//
// Replaces useTasks.js now that the Tasks tab is gone. Notes have no timer,
// so — unlike useStopwatch/useTasks — this hook does NOT run any 1-second
// interval, which means it never forces the whole app to re-render every
// second. It just subscribes to Firestore and hands back the live list.
import { useEffect, useState } from "react";
import { watchNotes } from "../lib/firestore";

export function useNotes(uid) {
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    if (!uid) { setNotes([]); return; }
    return watchNotes(uid, setNotes);
  }, [uid]);

  return { notes };
}
