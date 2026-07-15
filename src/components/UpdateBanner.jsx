// src/components/UpdateBanner.jsx
//
// Shown at the very top of the app, above StatusBar, whenever an admin has
// switched the banner ON from the admin panel (config/appUpdate.enabled).
// Purely presentational — App.jsx owns the live Firestore listener
// (watchAppUpdateConfig) and just passes the doc down as `config`.
//
// DISMISSAL: once someone taps "Update", we don't want to keep nagging them
// about the *same* update every time they open the app. There's no
// per-user field in Firestore for this (the config doc is shared/global
// across all users), so we track "which update have I already acted on"
// locally via localStorage, keyed to a fingerprint of this specific
// update's content (its `version` field if the admin sets one, otherwise a
// combination of title+message+url). If the admin later pushes a genuinely
// new update (different version/content), the fingerprint changes and the
// banner reappears — including for people who dismissed the previous one.

import React from "react";
import { Megaphone, ArrowUpRight } from "lucide-react";
import { COL } from "../theme";

const STORAGE_KEY = "focusly:dismissedUpdateFingerprint";

function fingerprintFor(config) {
  return String(config.version ?? `${config.title || ""}|${config.message || ""}|${config.url || ""}`);
}

export default function UpdateBanner({ config }) {
  if (!config?.enabled) return null;

  const fingerprint = fingerprintFor(config);
  let dismissedFingerprint = null;
  try {
    dismissedFingerprint = localStorage.getItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable (private browsing, etc.) — banner just
    // won't remember dismissal in that case, which is a safe fallback.
  }
  if (dismissedFingerprint === fingerprint) return null;

  const title = config.title || "App is now updated";
  const message = config.message || "A new version of Focusly is available. Update now to get the latest features.";
  const buttonText = config.buttonText || "Update";
  const url = config.url || "https://focusly.site.je/";

  const handleUpdateClick = () => {
    try {
      localStorage.setItem(STORAGE_KEY, fingerprint);
    } catch {
      // Non-fatal — worst case the banner shows again next visit.
    }
    // Let the <a> tag's default navigation (target="_blank") proceed as normal.
  };

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-2xl mb-3"
      style={{
        background: `linear-gradient(100deg, ${COL.violet}26, ${COL.violet}12)`,
        border: `1px solid ${COL.violet}55`,
      }}
    >
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        style={{ background: `${COL.violet}30` }}
      >
        <Megaphone size={15} color={COL.violet} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-display font-semibold text-xs" style={{ color: COL.ink }}>
          {title}
        </div>
        <div className="font-body text-[11px] mt-0.5" style={{ color: COL.sub }}>
          {message}
        </div>
      </div>

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleUpdateClick}
        className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl font-display font-semibold text-xs active:scale-95 transition"
        style={{ background: COL.violet, color: "#fff" }}
      >
        {buttonText} <ArrowUpRight size={13} />
      </a>
    </div>
  );
}
