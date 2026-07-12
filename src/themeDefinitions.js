// src/themeDefinitions.js
// All available app-wide visual themes. Each theme provides its own COL
// palette + neu() shadow function + optional background decoration.
//
// To add a new purchasable theme:
//   1. Add an entry to THEME_DEFINITIONS below with a unique `id`.
//   2. Add a matching store item in storeItems.js (APP_THEMES_PACK) with
//      the same id, so it can be bought/owned/equipped like a mascot.
// That's it — Settings and the theme system pick it up automatically.

const BASE = {
  ink: "#F2F2F7", sub: "#8C8CA1",
  violet: "#7B6EF6", violetDeep: "#5C4CE0", blue: "#5AA7FF",
  mint: "#3FCFA3", coral: "#FF7A85", gold: "#FFB648",
};

export const THEME_DEFINITIONS = {
  // Default theme — always owned, free, cannot be un-equipped-into-nothing.
  neumorphic: {
    id: "neumorphic",
    name: "Neumorphic",
    price: 0,
    default: true,
    preview: { bg: "#15151C", accent: "#7B6EF6" },
    COL: {
      ...BASE,
      bg: "#15151C", card: "#1C1C26",
      track: "#2A2A38", border: "#33333F", input: "#22222E",
    },
    neu: (inset = false, r = 20) => ({
      borderRadius: r,
      background: "#1C1C26",
      boxShadow: inset
        ? "inset 6px 6px 14px rgba(0,0,0,0.55), inset -6px -6px 14px rgba(255,255,255,0.04)"
        : "8px 8px 20px rgba(0,0,0,0.55), -8px -8px 18px rgba(255,255,255,0.035)",
    }),
    blobs: null,
  },

  // Purchasable — 2000 coins in the Store, under "App Themes".
  glass: {
    id: "glass",
    name: "Glass",
    price: 2000,
    default: false,
    preview: { bg: "#15151C", accent: "#7B6EF6", glass: true },
    COL: {
      ...BASE,
      bg: "#15151C", card: "rgba(255,255,255,0.06)",
      track: "#2A2A38", border: "rgba(255,255,255,0.14)", input: "rgba(255,255,255,0.08)",
    },
    neu: (inset = false, r = 20) => ({
      borderRadius: r,
      background: "rgba(255,255,255,0.06)",
      backdropFilter: "blur(18px)",
      WebkitBackdropFilter: "blur(18px)",
      border: "1px solid rgba(255,255,255,0.14)",
      boxShadow: inset
        ? "inset 0 2px 8px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)"
        : "0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.15)",
    }),
    blobs: [
      { background: "#7B6EF6", opacity: 0.35, size: 320, top: "-80px", left: "-60px" },
      { background: "#5AA7FF", opacity: 0.28, size: 280, top: "220px", right: "-90px" },
      { background: "#3FCFA3", opacity: 0.22, size: 300, bottom: "-60px", left: "20px" },
    ],
  },
};

export const DEFAULT_THEME_ID = "neumorphic";

// Flat list, handy for rendering a picker in Settings.
export const THEME_LIST = Object.values(THEME_DEFINITIONS);
