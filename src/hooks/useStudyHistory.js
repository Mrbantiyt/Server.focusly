// src/hooks/useStudyHistory.js
import { useEffect, useState } from "react";
import { dayKeyFor } from "../lib/time";
import { watchStudyHistory } from "../lib/firestore";

// Loads day-key -> seconds for the last `days` days (defaults to 31, enough
// for both the calendar month view and the 7-day/1-month graph).
export function useStudyHistory(uid, days = 31) {
  const [history, setHistory] = useState({});

  useEffect(() => {
    if (!uid) return;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    const startKey = dayKeyFor(start);
    const endKey = dayKeyFor(end);
    return watchStudyHistory(uid, startKey, endKey, setHistory);
  }, [uid, days]);

  return history;
}
