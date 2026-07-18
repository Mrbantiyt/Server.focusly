// src/hooks/useSubjectHistory.js
import { useEffect, useState } from "react";
import { dayKeyFor } from "../lib/time";
import { watchSubjectHistory } from "../lib/firestore";

// Loads day-key -> { subjectName: seconds } for the last `days` days.
// Same shape/pattern as useStudyHistory, but per-subject — lets the Stats
// tab sum just the CURRENT WEEK's days for "Time by Subject", instead of
// using the ever-growing lifetime `subjectSeconds` total (which never
// resets and would make that card's total drift away from the "Total Study
// Time (this week)" card right above it).
export function useSubjectHistory(uid, days = 31) {
  const [history, setHistory] = useState({});

  useEffect(() => {
    if (!uid) return;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    const startKey = dayKeyFor(start);
    const endKey = dayKeyFor(end);
    return watchSubjectHistory(uid, startKey, endKey, setHistory);
  }, [uid, days]);

  return history;
}
