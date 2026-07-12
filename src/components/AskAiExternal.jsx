// src/components/AskAiExternal.jsx
//
// Embeds NoteGPT (https://www.surfsense.com/free/gpt-o4-mini-no-login) inside the app via an iframe,
// gated behind a daily TIME budget per plan (Free 5min / Team 30min /
// Max unlimited — see AI_TIME_LIMITS_MIN in lib/billing.js).
//
// We can't see anything that happens *inside* the NoteGPT iframe (browser
// same-origin rules block that entirely — no message count, no reply
// text), so the only thing we can actually meter is wall-clock time the
// screen has been open. That's tracked here and persisted to Firestore via
// addAiUsageSeconds every ~10s, so it survives a closed tab/app and stays
// in sync across devices (same pattern as the rest of aiUsage).
import { useEffect, useRef, useState } from "react";
import { Clock, WifiOff, RotateCw, Pause, Play, Sparkles } from "lucide-react";
import { COL, neu } from "../theme";
import { getEffectivePlan, getAiTimeLimitSeconds, PLAN_LABELS, PLAN } from "../lib/billing";
import { addAiUsageSeconds } from "../lib/firestore";

const NOTEGPT_URL = "https://www.surfsense.com/free/gpt-o4-mini-no-login";
const PERSIST_INTERVAL_MS = 10000; // how often we flush elapsed time to Firestore
// If the iframe hasn't fired onLoad within this window, we assume it's
// stuck or blocked (ad-blocker, extension, network filter, CSP, X-Frame-
// Options, etc.) and swap the loading skeleton for an explicit "couldn't
// load" card with a retry button, instead of leaving the skeleton
// spinning forever or dead-ending on a no-retry message.
const LOAD_TIMEOUT_MS = 12000;

// Shown inside Ask AI while the NoteGPT iframe is loading. If it doesn't
// finish within LOAD_TIMEOUT_MS, AskAiBlockedCard takes over instead (see
// below). Mirrors the general shape of the NoteGPT screen: a top bar, a
// few suggestion-chip-like blocks, and an input bar at the bottom.
export function AskAiSkeleton() {
  return (
    <div className="h-full w-full flex flex-col gap-4 p-1">
      <style>{`
        .skeleton-shimmer {
          position: relative;
          overflow: hidden;
        }
        .skeleton-shimmer::after {
          content: "";
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(
            90deg,
            transparent,
            rgba(242,242,247,0.06),
            transparent
          );
          animation: skeleton-sweep 1.4s ease-in-out infinite;
        }
        @keyframes skeleton-sweep {
          100% { transform: translateX(100%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .skeleton-shimmer::after { animation: none; }
        }
      `}</style>

      <div className="flex items-center justify-between">
        <Bone w={110} h={16} r={6} />
        <Bone w={70} h={28} r={999} />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <Bone w="80%" h={54} r={16} />
        <Bone w="80%" h={54} r={16} />
        <Bone w="80%" h={54} r={16} />
        <Bone w="80%" h={54} r={16} />
      </div>

      <Bone w="100%" h={54} r={999} />
    </div>
  );
}

function Bone({ w, h, r = 10, style = {} }) {
  return (
    <div
      className="skeleton-shimmer"
      style={{
        width: w,
        height: h,
        borderRadius: r,
        background: COL.track,
        ...style,
      }}
    />
  );
}

// Shown in place of the skeleton once LOAD_TIMEOUT_MS passes without the
// iframe firing onLoad — i.e. it's either stuck on a slow connection or
// actively blocked (ad-blocker / browser extension / network policy /
// NoteGPT refusing to be framed). Lets the person retry instead of
// dead-ending.
function AskAiBlockedCard({ onRetry }) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-4 text-center px-6">
      <div style={neu(false, 20)} className="p-6 flex flex-col items-center gap-3">
        <WifiOff size={22} color={COL.coral} />
        <div className="font-display font-semibold text-sm" style={{ color: COL.ink }}>
          Ask AI couldn't load
        </div>
        <div className="font-body text-xs" style={{ color: COL.sub, maxWidth: 240 }}>
          This can happen on a slow connection, or if an ad-blocker / browser extension is blocking it.
        </div>
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 rounded-full font-body text-xs font-medium"
          style={{ ...neu(false, 999), color: COL.violet }}
        >
          <RotateCw size={14} />
          Try again
        </button>
      </div>
    </div>
  );
}

function formatMMSS(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

export default function AskAiExternal({ user, billing, aiUsage, dayKey, onUpgradePlan }) {
  const effectivePlan = getEffectivePlan(billing);
  const limitSeconds = getAiTimeLimitSeconds(billing); // null = unlimited (Max)
  const usedSecondsToday = aiUsage && aiUsage.dayKey === dayKey ? aiUsage.seconds || 0 : 0;

  const [iframeStatus, setIframeStatus] = useState("loading"); // "loading" | "loaded" | "blocked"
  const [liveUsedSeconds, setLiveUsedSeconds] = useState(usedSecondsToday);
  // Bumping this forces the <iframe> to remount (fresh src load) when the
  // person taps "Try again" on the blocked card, or "Start" after a pause.
  const [reloadKey, setReloadKey] = useState(0);
  // While paused: the iframe is unmounted entirely (no chat, no messages
  // can be sent) and the usage timer stops ticking/persisting.
  const [isPaused, setIsPaused] = useState(false);

  const tickIntervalRef = useRef(null);
  const unpersistedRef = useRef(0); // seconds accumulated locally, not yet flushed to Firestore
  const loadTimeoutRef = useRef(null);

  const limitReached = limitSeconds !== null && usedSecondsToday >= limitSeconds;

  // If the iframe hasn't loaded within LOAD_TIMEOUT_MS, treat it as
  // blocked/stuck and swap the skeleton for the retry card. Restarts
  // whenever reloadKey changes (i.e. on every retry attempt) or when
  // resuming from a pause.
  useEffect(() => {
    if (limitReached || isPaused) return;
    setIframeStatus("loading");
    loadTimeoutRef.current = setTimeout(() => {
      setIframeStatus((prev) => (prev === "loaded" ? prev : "blocked"));
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(loadTimeoutRef.current);
  }, [reloadKey, limitReached, isPaused]);

  const handleRetry = () => setReloadKey((k) => k + 1);
  const handlePause = () => setIsPaused(true);
  const handleStart = () => {
    setIsPaused(false);
    setReloadKey((k) => k + 1); // fresh iframe load on resume
  };

  useEffect(() => {
    if (limitReached || isPaused || !user?.uid) return;

    tickIntervalRef.current = setInterval(() => {
      setLiveUsedSeconds((prev) => {
        const next = prev + 1;
        unpersistedRef.current += 1;
        if (unpersistedRef.current >= PERSIST_INTERVAL_MS / 1000) {
          const toFlush = unpersistedRef.current;
          unpersistedRef.current = 0;
          addAiUsageSeconds(user.uid, dayKey, toFlush).catch((err) =>
            console.error("Failed to persist AI usage time:", err)
          );
        }
        return next;
      });
    }, 1000);

    return () => {
      clearInterval(tickIntervalRef.current);
      if (unpersistedRef.current > 0 && user?.uid) {
        const toFlush = unpersistedRef.current;
        unpersistedRef.current = 0;
        addAiUsageSeconds(user.uid, dayKey, toFlush).catch((err) =>
          console.error("Failed to persist AI usage time:", err)
        );
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limitReached, isPaused, user?.uid, dayKey]);

  useEffect(() => {
    setLiveUsedSeconds(usedSecondsToday);
  }, [usedSecondsToday]);

  const overBudgetNow = limitSeconds !== null && liveUsedSeconds >= limitSeconds;

  if (limitReached || overBudgetNow) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-6">
        <div style={neu(false, 20)} className="p-6 flex flex-col items-center gap-3">
          <Clock size={22} color={COL.coral} />
          <div className="font-display font-semibold text-sm" style={{ color: COL.ink }}>
            Today's Ask AI time is used up
          </div>
          <div className="font-body text-xs" style={{ color: COL.sub }}>
            {PLAN_LABELS[effectivePlan]} plan gets{" "}
            {limitSeconds !== null ? `${Math.round(limitSeconds / 60)} min` : "unlimited"} of Ask AI per day.
            More time unlocks at 12:00 AM.
          </div>
          {effectivePlan !== PLAN.MAX && onUpgradePlan && (
            <button
              onClick={onUpgradePlan}
              className="flex items-center gap-2 px-4 py-2 rounded-full font-body text-xs font-semibold mt-1"
              style={{ background: COL.violet, color: "#fff" }}
            >
              <Sparkles size={14} />
              Upgrade plan
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col gap-2">
      <div className="px-1 flex items-center justify-between text-xs font-body" style={{ color: COL.sub }}>
        <span>{PLAN_LABELS[effectivePlan]} plan</span>
        <div className="flex items-center gap-3">
          {limitSeconds !== null && (
            <span>{formatMMSS(Math.max(0, limitSeconds - liveUsedSeconds))} left today</span>
          )}
          {isPaused ? (
            <button
              onClick={handleStart}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full font-body text-xs font-medium"
              style={{ ...neu(false, 999), color: COL.mint }}
            >
              <Play size={12} />
              Start
            </button>
          ) : (
            <button
              onClick={handlePause}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full font-body text-xs font-medium"
              style={{ ...neu(false, 999), color: COL.sub }}
            >
              <Pause size={12} />
              Stop
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 rounded-2xl overflow-hidden relative" style={{ background: COL.card }}>
        {isPaused ? (
          <div className="h-full w-full flex flex-col items-center justify-center gap-3 text-center px-6">
            <Pause size={20} color={COL.sub} />
            <div className="font-body text-xs" style={{ color: COL.sub }}>
              Ask AI is paused. No time is being used, and no chat is loaded.
            </div>
          </div>
        ) : (
          <>
            {iframeStatus === "loading" && (
              <div className="absolute inset-0 z-10">
                <AskAiSkeleton />
              </div>
            )}
            {iframeStatus === "blocked" && (
              <div className="absolute inset-0 z-10" style={{ background: COL.card }}>
                <AskAiBlockedCard onRetry={handleRetry} />
              </div>
            )}
            <iframe
              key={reloadKey}
              title="NoteGPT AI Chat"
              src={NOTEGPT_URL}
              onLoad={() => setIframeStatus("loaded")}
              className="w-full h-full border-0"
              style={{ opacity: iframeStatus === "loaded" ? 1 : 0 }}
              sandbox="allow-scripts allow-forms allow-popups allow-same-origin allow-popups-to-escape-sandbox"
            />
          </>
        )}
      </div>
    </div>
  );
}
