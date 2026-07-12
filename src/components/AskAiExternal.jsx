// src/components/AskAiExternal.jsx
//
// Embeds NoteGPT (https://notegpt.io/ai-chat) inside the app via an iframe,
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
import { ExternalLink, Clock } from "lucide-react";
import { COL, neu } from "../theme";
import { getEffectivePlan, getAiTimeLimitSeconds, PLAN_LABELS } from "../lib/billing";
import { addAiUsageSeconds } from "../lib/firestore";

const NOTEGPT_URL = "https://notegpt.io/ai-chat";
const IFRAME_LOAD_TIMEOUT_MS = 4000;
const PERSIST_INTERVAL_MS = 10000; // how often we flush elapsed time to Firestore

function formatMMSS(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

export default function AskAiExternal({ user, billing, aiUsage, dayKey }) {
  const effectivePlan = getEffectivePlan(billing);
  const limitSeconds = getAiTimeLimitSeconds(billing); // null = unlimited (Max)
  const usedSecondsToday = aiUsage && aiUsage.dayKey === dayKey ? aiUsage.seconds || 0 : 0;

  const [iframeStatus, setIframeStatus] = useState("loading"); // "loading" | "loaded" | "blocked"
  const [liveUsedSeconds, setLiveUsedSeconds] = useState(usedSecondsToday);

  const iframeTimeoutRef = useRef(null);
  const tickIntervalRef = useRef(null);
  const unpersistedRef = useRef(0); // seconds accumulated locally, not yet flushed to Firestore

  const limitReached = limitSeconds !== null && usedSecondsToday >= limitSeconds;

  useEffect(() => {
    if (limitReached) return;
    iframeTimeoutRef.current = setTimeout(() => {
      setIframeStatus((s) => (s === "loading" ? "blocked" : s));
    }, IFRAME_LOAD_TIMEOUT_MS);
    return () => clearTimeout(iframeTimeoutRef.current);
  }, [limitReached]);

  useEffect(() => {
    if (limitReached || !user?.uid) return;

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
  }, [limitReached, user?.uid, dayKey]);

  useEffect(() => {
    setLiveUsedSeconds(usedSecondsToday);
  }, [usedSecondsToday]);

  const overBudgetNow = limitSeconds !== null && liveUsedSeconds >= limitSeconds;

  const openNewTab = () => window.open(NOTEGPT_URL, "_blank", "noopener,noreferrer");

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
        </div>
      </div>
    );
  }

  if (iframeStatus === "blocked") {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-6">
        <div style={neu(false, 20)} className="p-6 flex flex-col items-center gap-3">
          <ExternalLink size={22} color={COL.violet} />
          <div className="font-display font-semibold text-sm" style={{ color: COL.ink }}>
            Can't be shown inline here
          </div>
          <div className="font-body text-xs" style={{ color: COL.sub }}>
            NoteGPT doesn't allow embedding, so it needs to open in its own tab.
          </div>
          {limitSeconds !== null && (
            <div className="font-body text-[11px]" style={{ color: COL.sub }}>
              {formatMMSS(Math.max(0, limitSeconds - liveUsedSeconds))} left today
            </div>
          )}
          <button
            onClick={openNewTab}
            className="mt-1 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: COL.violet, color: "#fff" }}
          >
            Open NoteGPT
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col gap-2">
      {limitSeconds !== null && (
        <div className="px-1 flex items-center justify-between text-xs font-body" style={{ color: COL.sub }}>
          <span>{PLAN_LABELS[effectivePlan]} plan</span>
          <span>{formatMMSS(Math.max(0, limitSeconds - liveUsedSeconds))} left today</span>
        </div>
      )}
      <div className="flex-1 rounded-2xl overflow-hidden" style={{ background: COL.card }}>
        <iframe
          title="NoteGPT AI Chat"
          src={NOTEGPT_URL}
          onLoad={() => {
            clearTimeout(iframeTimeoutRef.current);
            setIframeStatus("loaded");
          }}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-forms allow-popups allow-same-origin allow-popups-to-escape-sandbox"
        />
      </div>
    </div>
  );
}
