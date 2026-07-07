// src/components/Chat.jsx
// The old in-app "Focusly AI" chat (OpenAI-backed) has been replaced with
// buttons that open Gemini / Google in a native in-app browser overlay —
// using the Median JS Bridge (median.window.open(url, "appbrowser")).
//
// Why "appbrowser" instead of an <iframe>:
// Google's properties (google.com, gemini.google.com) send an
// X-Frame-Options / Content-Security-Policy header that blocks being
// embedded in a same-page <iframe> — no client-side code can work around
// that. Median's "appbrowser" mode is different: it's a real native WebView
// window layered on top of the app (not an iframe inside this page), so it
// isn't subject to that restriction. It opens full-screen over the app,
// doesn't switch/open a browser tab, and returns focus to the app the
// moment the user closes it (see median_appbrowser_closed below).
//
// This only works when running inside the Median-built app shell (the
// `median` object is injected at runtime by that native wrapper). If this
// page is opened in a plain desktop/mobile browser during development,
// `window.median` won't exist — in that case we fall back to a normal
// window.open() new tab so the buttons still do *something* sensible.
import React, { useEffect, useState } from "react";
import { Sparkles, Search } from "lucide-react";
import { COL, neu } from "../theme";

const SITES = [
  { id: "gemini", label: "Gemini", url: "https://gemini.google.com/app", icon: Sparkles, desc: "Make notes" },
  { id: "google", label: "Google", url: "https://www.google.com", icon: Search, desc: "Search a topic" },
];

export default function Chat() {
  const [openId, setOpenId] = useState(null);

  // Lets the app know the overlay was closed (Median calls this automatically).
  useEffect(() => {
    window.median_appbrowser_closed = () => setOpenId(null);
    return () => { delete window.median_appbrowser_closed; };
  }, []);

  const openSite = (site) => {
    setOpenId(site.id);
    if (window.median?.window?.open) {
      window.median.window.open(site.url, "appbrowser");
    } else {
      // Not running inside the Median app shell (e.g. testing in a regular
      // browser) — no native "appbrowser" mode is available, so this is the
      // closest available fallback.
      window.open(site.url, "_blank", "noopener,noreferrer");
      setOpenId(null);
    }
  };

  return (
    <div className="flex flex-col h-full items-center justify-center gap-4 px-2">
      <div className="font-display font-semibold text-lg" style={{ color: COL.ink }}>Ask AI</div>
      <div className="font-body text-xs text-center px-6" style={{ color: COL.sub }}>
        Opens right here in the app — pick one below.
      </div>

      <div className="w-full flex flex-col gap-3 mt-2">
        {SITES.map((s) => {
          const Icon = s.icon;
          const busy = openId === s.id;
          return (
            <button
              key={s.id}
              onClick={() => openSite(s)}
              disabled={busy}
              style={neu(false, 20)}
              className="p-4 flex items-center gap-3 active:scale-[0.98] transition disabled:opacity-60"
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(123,110,246,0.15)" }}>
                <Icon size={16} color={COL.violet} />
              </div>
              <div className="text-left">
                <div className="font-display font-semibold text-sm" style={{ color: COL.ink }}>{s.label}</div>
                <div className="font-body text-xs" style={{ color: COL.sub }}>{busy ? "Opening…" : s.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
