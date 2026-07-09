// src/theme.js
export const COL = {
  bg: "#15151C", card: "#1C1C26", ink: "#F2F2F7", sub: "#8C8CA1",
  violet: "#7B6EF6", violetDeep: "#5C4CE0", blue: "#5AA7FF",
  mint: "#3FCFA3", coral: "#FF7A85", gold: "#FFB648",
  track: "#2A2A38", border: "#33333F", input: "#22222E",
};

export const neu = (inset = false, r = 20) => ({
  borderRadius: r,
  background: COL.card,
  boxShadow: inset
    ? "inset 6px 6px 14px rgba(0,0,0,0.55), inset -6px -6px 14px rgba(255,255,255,0.04)"
    : "8px 8px 20px rgba(0,0,0,0.55), -8px -8px 18px rgba(255,255,255,0.035)",
});
