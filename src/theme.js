// src/theme.js
export const COL = {
  bg: "#EEF0F7", card: "#F7F8FC", ink: "#2B2A3D", sub: "#8C8CA1",
  violet: "#7B6EF6", violetDeep: "#5C4CE0", blue: "#5AA7FF",
  mint: "#3FCFA3", coral: "#FF7A85",
};

export const neu = (inset = false, r = 20) => ({
  borderRadius: r,
  background: COL.card,
  boxShadow: inset
    ? "inset 6px 6px 14px rgba(163,170,199,0.35), inset -6px -6px 14px rgba(255,255,255,0.9)"
    : "8px 8px 20px rgba(163,170,199,0.45), -8px -8px 18px rgba(255,255,255,0.85)",
});
