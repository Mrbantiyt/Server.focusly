// src/theme.js
//
// COL and neu() are mutated in place (never reassigned) so every existing
// `import { COL, neu } from "./theme"` across the app keeps working as-is —
// no need to touch 17+ component files when adding a new theme.
//
// Components that need to re-render when the theme changes should use the
// useAppTheme() hook below (or just live inside <ThemeProvider>, which
// remounts its subtree on theme change via a `key`).
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { THEME_DEFINITIONS, DEFAULT_THEME_ID } from "./themeDefinitions";

export const COL = { ...THEME_DEFINITIONS[DEFAULT_THEME_ID].COL };

export function neu(inset = false, r = 20) {
  return _neuImpl(inset, r);
}
let _neuImpl = THEME_DEFINITIONS[DEFAULT_THEME_ID].neu;

export let GLASS_BG_STYLE = {
  position: "fixed",
  inset: 0,
  overflow: "hidden",
  pointerEvents: "none",
  zIndex: 0,
};

export let glassBlobs = THEME_DEFINITIONS[DEFAULT_THEME_ID].blobs || [];

const LOCAL_KEY = "focusly:appTheme";
const listeners = new Set();

function applyTheme(themeId) {
  const def = THEME_DEFINITIONS[themeId] || THEME_DEFINITIONS[DEFAULT_THEME_ID];

  Object.keys(COL).forEach((k) => delete COL[k]);
  Object.assign(COL, def.COL);

  _neuImpl = def.neu;
  glassBlobs = def.blobs || [];

  listeners.forEach((fn) => fn(def.id));
}

export function getStoredThemeId() {
  try {
    return localStorage.getItem(LOCAL_KEY) || DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

// Call this to switch the whole app's visual theme at runtime (e.g. after
// buying/equipping a theme in the Store, or picking one in Settings).
export function setAppTheme(themeId) {
  const id = THEME_DEFINITIONS[themeId] ? themeId : DEFAULT_THEME_ID;
  try {
    localStorage.setItem(LOCAL_KEY, id);
  } catch {}
  applyTheme(id);
}

// Apply once on module load (e.g. picks up a previously-equipped theme on refresh).
applyTheme(getStoredThemeId());

const ThemeContext = createContext(DEFAULT_THEME_ID);

// Wrap the app root with this. It remounts its children (via `key`) whenever
// the active theme changes, so components reading COL/neu at render time
// pick up the new values without needing to be individually theme-aware.
export function ThemeProvider({ children }) {
  const [themeId, setThemeId] = useState(getStoredThemeId());

  useEffect(() => {
    const onChange = (id) => setThemeId(id);
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  }, []);

  return React.createElement(
    ThemeContext.Provider,
    { value: themeId },
    React.createElement(React.Fragment, { key: themeId }, children)
  );
}

// Returns the current theme id and a setter — use in Settings/Store UI so
// the picker itself re-renders (e.g. to highlight the active option).
export function useAppTheme() {
  const themeId = useContext(ThemeContext);
  const setTheme = useCallback((id) => setAppTheme(id), []);
  return [themeId, setTheme];
}
