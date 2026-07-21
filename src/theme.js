// src/theme.js
export const COL = {
  bg: "#0E0E16", card: "#1C1C26", ink: "#F2F2F7", sub: "#9C9CB4",
  violet: "#7B6EF6", violetDeep: "#5C4CE0", blue: "#5AA7FF",
  mint: "#3FCFA3", coral: "#FF7A85", gold: "#FFB648",
  track: "#2A2A38", border: "#33333F", input: "#22222E",
};

// ---------------------------------------------------------------------------
// LIQUID GLASS surface system
// ---------------------------------------------------------------------------
// Every card/button in the app used to call neu(inset, radius) to get a
// neumorphic soft-shadow "pressed into foam" look. `neu()` is kept as the
// name (so none of the 19 call sites elsewhere need to change) but now
// returns a frosted-glass surface instead: a translucent tinted fill,
// backdrop blur+saturation (the actual "glass" refraction), a hairline
// translucent border, and a layered shadow — a soft ambient drop shadow for
// depth plus a bright inset top edge that reads as a light-catching bevel,
// the detail that sells glass rather than "blur with a border."
//
// This only works visually because App.jsx now paints a fixed, colorful
// ambient gradient behind the whole page (see LiquidBackground) — glass has
// nothing to refract against a flat single-color background, it just looks
// like fog.
//
// `inset` (the "pressed" state — used for active toggles, input wells, the
// timer's numeric readout background) becomes a recessed pane: less blur,
// darker/less saturated fill, and the highlight moves from the top edge to
// an inner shadow, so it reads as sitting a level BELOW the glass around it
// instead of floating above the background like the default surface does.
export const neu = (inset = false, r = 20) => ({
  borderRadius: r,
  background: inset
    ? "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.05))"
    : "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))",
  backdropFilter: inset ? "blur(10px) saturate(140%)" : "blur(22px) saturate(180%)",
  WebkitBackdropFilter: inset ? "blur(10px) saturate(140%)" : "blur(22px) saturate(180%)",
  border: inset ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(255,255,255,0.14)",
  boxShadow: inset
    ? "inset 0 2px 8px rgba(0,0,0,0.45), inset 0 -1px 0 rgba(255,255,255,0.02)"
    : "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.16)",
});

// Fixed, full-viewport ambient gradient mesh painted once behind the app
// shell. Glass surfaces need colorful light behind them to visibly refract
// — without this, backdrop-blur over a flat background just looks like
// grey fog instead of glass. Three soft radial blobs in the app's existing
// accent colors (violet/blue/mint), placed off-grid so nothing feels
// centered/templated, deliberately not synced to any UI state — it's
// ambient atmosphere, not a data visualization.
export const LIQUID_BG_STYLE = {
  background: `
    radial-gradient(38% 30% at 12% 8%, rgba(123,110,246,0.35), transparent 70%),
    radial-gradient(42% 34% at 92% 18%, rgba(90,167,255,0.28), transparent 70%),
    radial-gradient(46% 38% at 25% 96%, rgba(63,207,163,0.22), transparent 70%),
    ${COL.bg}
  `,
};
