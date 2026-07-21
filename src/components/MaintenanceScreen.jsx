// src/components/MaintenanceScreen.jsx
//
// Full-screen block shown INSTEAD OF the entire app whenever an admin has
// switched maintenance mode ON from the admin panel (config/maintenance.
// enabled) — see watchMaintenanceConfig in lib/firestore.js and App.jsx,
// which owns the live listener and the admin-claim check, and only renders
// this when both "maintenance is on" AND "this signed-in user is not an
// admin" are true. Purely presentational otherwise.
//
// Deliberately has no way to dismiss/skip past it (no close button, no
// "continue anyway") — the whole point is that non-admin users can't use
// the app while this is up, only admins can (by not seeing this screen at
// all, per App.jsx).

import React from "react";
import { Wrench } from "lucide-react";
import { COL } from "../theme";

const DEFAULT_TITLE = "Under maintenance";
const DEFAULT_MESSAGE =
  "Focusly is currently undergoing scheduled maintenance. We'll be back shortly — thanks for your patience!";

export default function MaintenanceScreen({ config }) {
  const title = config?.title || DEFAULT_TITLE;
  const message = config?.message || DEFAULT_MESSAGE;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{ background: COL.bg }}
    >
      <div className="w-full max-w-sm flex flex-col items-center text-center gap-4">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: `${COL.gold}22` }}
        >
          <Wrench size={28} color={COL.gold} />
        </div>

        <div className="font-display font-bold text-lg" style={{ color: COL.ink }}>
          {title}
        </div>

        <div className="font-body text-sm leading-relaxed" style={{ color: COL.sub }}>
          {message}
        </div>
      </div>
    </div>
  );
}
