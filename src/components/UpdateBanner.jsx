// src/components/UpdateBanner.jsx
//
// Shown at the very top of the app, above StatusBar, whenever an admin has
// switched the banner ON from the admin panel (config/appUpdate.enabled).
// Purely presentational — App.jsx owns the live Firestore listener
// (watchAppUpdateConfig) and just passes the doc down as `config`.

import React from "react";
import { Megaphone, ArrowUpRight } from "lucide-react";
import { COL } from "../theme";

export default function UpdateBanner({ config }) {
  if (!config?.enabled) return null;

  const title = config.title || "App is now updated";
  const message = config.message || "A new version of Focusly is available. Update now to get the latest features.";
  const buttonText = config.buttonText || "Update";
  const url = config.url || "https://focusly.site.je/";

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
        <div className="font-body text-[11px] mt-0.5 truncate" style={{ color: COL.sub }}>
          {message}
        </div>
      </div>

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl font-display font-semibold text-xs active:scale-95 transition"
        style={{ background: COL.violet, color: "#fff" }}
      >
        {buttonText} <ArrowUpRight size={13} />
      </a>
    </div>
  );
}
