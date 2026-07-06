// src/hooks/useGameStats.js
import { useEffect, useRef, useState } from "react";
import { dayKeyFor } from "../lib/time";
import { addXp, levelFromXp, registerDailyLogin, watchGameStats } from "../lib/firestore";

const XP_PER_TICK = 5;
const TICK_MS = 10000; // 5 XP every 10 seconds of active study time

// Tracks XP / level / coins / streak for the signed-in user.
// - XP grows only while the stopwatch (`running`) is true, +5 every 10s.
// - Level derives from total XP: level 1 needs 100 XP, then +500 XP per level.
// - Coins: +1000 credited automatically the moment a level is crossed.
// - Streak: bumped once per calendar day on login (see registerDailyLogin).
export function useGameStats(uid, running) {
  const [stats, setStats] = useState({ xp: 0, coins: 0, streak: 0, streakDays: {} });
  const accumulatedRef = useRef(0);
  const loginRegisteredRef = useRef(null);

  // live sync from Firestore
  useEffect(() => {
    if (!uid) { setStats({ xp: 0, coins: 0, streak: 0, streakDays: {} }); return; }
    return watchGameStats(uid, setStats);
  }, [uid]);

  // credit the daily-login streak once per uid per day
  useEffect(() => {
    if (!uid) return;
    const todayKey = dayKeyFor(new Date());
    if (loginRegisteredRef.current === `${uid}:${todayKey}`) return;
    loginRegisteredRef.current = `${uid}:${todayKey}`;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    registerDailyLogin(uid, todayKey, dayKeyFor(yesterday));
  }, [uid]);

  // award XP every TICK_MS while running
  useEffect(() => {
    if (!uid) return;
    const id = setInterval(() => {
      if (!running) return;
      accumulatedRef.current += 1000;
      if (accumulatedRef.current >= TICK_MS) {
        accumulatedRef.current -= TICK_MS;
        addXp(uid, XP_PER_TICK);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [uid, running]);

  const { level, xpIntoLevel, xpForNextLevel } = levelFromXp(stats.xp);

  return {
    xp: stats.xp,
    coins: stats.coins,
    streak: stats.streak,
    streakDays: stats.streakDays,
    level,
    xpIntoLevel,
    xpForNextLevel,
  };
}
