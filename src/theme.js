// src/theme.js

const THEME_CACHE_PREFIX = "focusly:activeTheme:";

// "default" = the app's current, always-free look (unchanged for anyone
// who hasn't bought a theme). "liquidGlass" and "neomorphism" are the two
// PURCHASABLE themes in the Store — each only takes effect once bought,
// equipped, and the app is restarted.
export const THEMES = {
  default: "default",
  liquidGlass: "liquidGlass",
  neomorphism: "neomorphism",
  aura: "aura",
};

function readCachedTheme() {
  try {
    const raw = localStorage.getItem(THEME_CACHE_PREFIX + "current");
    if (raw === THEMES.neomorphism || raw === THEMES.liquidGlass || raw === THEMES.aura || raw === THEMES.default) return raw;
  } catch {
  }
  return THEMES.default;
}

export function cacheActiveTheme(themeId) {
  const value =
    themeId === THEMES.neomorphism || themeId === THEMES.liquidGlass || themeId === THEMES.aura
      ? themeId
      : THEMES.default;
  try {
    localStorage.setItem(THEME_CACHE_PREFIX + "current", value);
  } catch {
  }
}

const ACTIVE_THEME = readCachedTheme();

export function getActiveTheme() {
  return ACTIVE_THEME;
}

// ---------------------------------------------------------------------------
// COLOR PALETTES — one per theme.
// ---------------------------------------------------------------------------
// Every component reads text/icon/accent colors off COL.* (COL.ink,
// COL.sub, COL.card, ...). Neomorphism is a LIGHT theme (per reference —
// warm off-white background, dark ink text) while default/Glassmorphism
// are dark, so COL itself has to switch palettes, not just neu()/background
// — otherwise Neomorphism would render dark text invisible on its own
// light cards. Resolved once at module load alongside ACTIVE_THEME (same
// restart-to-apply rule as everything else in this file).
const PALETTE_DEFAULT = {
  bg: "#0E0E16", card: "#1C1C26", ink: "#F2F2F7", sub: "#9C9CB4",
  violet: "#7B6EF6", violetDeep: "#5C4CE0", blue: "#5AA7FF",
  mint: "#3FCFA3", coral: "#FF7A85", gold: "#FFB648",
  track: "#2A2A38", border: "#33333F", input: "#22222E",
};

// Glassmorphism purchasable theme — same accent hues as default so
// existing semantic colors (mint=success, coral=danger, etc.) still read
// correctly; only the surfaces/background become warm and frosted (see
// neu()/LIQUID_BG_STYLE below). Kept as its own palette (not literally
// PALETTE_DEFAULT) in case its accents need to diverge later.
const PALETTE_LIQUID_GLASS = { ...PALETTE_DEFAULT };

// Light warm-grey soft-UI palette — matches the Neomorphism reference
// (off-white/grey cards, dark charcoal ink, soft dual-tone shadows).
const PALETTE_NEOMORPHISM = {
  bg: "#E8E6E3", card: "#E8E6E3", ink: "#3A3A3A", sub: "#8A8680",
  violet: "#5B6EF6", violetDeep: "#4453D1", blue: "#4A90E2",
  mint: "#3FA36B", coral: "#E8555F", gold: "#D89A2A",
  track: "#D8D5D1", border: "#D2CFC9", input: "#DEDBD7",
};

// Light "smart-home" soft-UI palette — matches the reference: near-white
// background, pure-white cards, deep-navy accent (used for the active nav
// pill / featured cards), warm gold for secondary highlights.
const PALETTE_AURA = {
  bg: "#F4F5F8", card: "#FFFFFF", ink: "#10141C", sub: "#6B7688",
  violet: "#16406B", violetDeep: "#0E2C4A", blue: "#4A90E2",
  mint: "#3FA36B", coral: "#E8555F", gold: "#F4B740",
  track: "#EEF1F6", border: "#E7EBF2", input: "#F0F2F6",
};

function paletteFor(themeId) {
  if (themeId === THEMES.neomorphism) return PALETTE_NEOMORPHISM;
  if (themeId === THEMES.liquidGlass) return PALETTE_LIQUID_GLASS;
  if (themeId === THEMES.aura) return PALETTE_AURA;
  return PALETTE_DEFAULT;
}

export const COL = paletteFor(ACTIVE_THEME);

// Default/original surface: translucent-but-subtle dark card (the app's
// existing look prior to any theme purchase) — kept EXACTLY as it always
// was so no-purchase users see zero change.
function neuDefault(inset, r) {
  return {
    borderRadius: r,
    background: PALETTE_DEFAULT.card,
    border: `1px solid ${PALETTE_DEFAULT.border}`,
    boxShadow: inset
      ? "inset 4px 4px 10px rgba(0,0,0,0.35), inset -4px -4px 10px rgba(255,255,255,0.03)"
      : "6px 6px 14px rgba(0,0,0,0.40), -6px -6px 14px rgba(255,255,255,0.03)",
  };
}

// Glassmorphism (purchasable): translucent tinted fill, backdrop
// blur+saturation (the actual "glass" refraction), a hairline translucent
// border, and a layered shadow — a soft ambient drop shadow for depth plus
// a bright inset top edge that reads as a light-catching bevel. Needs the
// warm ambient LIQUID_BG_STYLE below behind it to visibly refract against.
function neuGlass(inset, r) {
  return {
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
  };
}

// Neomorphism (purchasable), light soft-UI: solid off-white card, dual
// drop-shadow (a darker warm-grey shadow toward the bottom-right, a bright
// near-white one toward the top-left) so surfaces read as gently extruded
// from — or, when `inset`, pressed into — the flat light background.
// Matches the reference image (soft grey, not the app's old dark
// neomorphic look).
function neuSoft(inset, r) {
  return {
    borderRadius: r,
    background: PALETTE_NEOMORPHISM.card,
    boxShadow: inset
      ? "inset 5px 5px 10px rgba(163,158,152,0.5), inset -5px -5px 10px rgba(255,255,255,0.8)"
      : "8px 8px 16px rgba(163,158,152,0.45), -8px -8px 16px rgba(255,255,255,0.85)",
  };
}

// Aura (purchasable): the reference's clean "smart-home app" surface — a
// solid white card with one soft ambient drop shadow (not the dual
// light/dark neomorphic shadow — this look reads as sitting flat on a
// pale background, not extruded from it). `inset` gives a faint pressed
// look for track/input surfaces.
function neuAura(inset, r) {
  return {
    borderRadius: r,
    background: PALETTE_AURA.card,
    border: inset ? `1px solid ${PALETTE_AURA.border}` : "none",
    boxShadow: inset
      ? "inset 0 2px 4px rgba(20,30,50,0.06)"
      : "0 2px 10px rgba(20,30,50,0.06)",
  };
}

export const neu = (inset = false, r = 20) => {
  if (ACTIVE_THEME === THEMES.neomorphism) return neuSoft(inset, r);
  if (ACTIVE_THEME === THEMES.liquidGlass) return neuGlass(inset, r);
  if (ACTIVE_THEME === THEMES.aura) return neuAura(inset, r);
  return neuDefault(inset, r);
};

// Fixed, full-viewport background painted once behind the app shell.
// Default: unchanged flat dark background (no-purchase users see no
// change at all). Glassmorphism: warm dark ambient — a photo-like blurred
// glow (soft orange/amber radial blobs over a near-black base) for the
// frosted panels above to visibly refract against. Neomorphism: the flat
// light base color — a flat single tone is what makes the soft-shadow
// extrusion read correctly (no blur/refraction needed for this theme).
export const LIQUID_BG_STYLE = (() => {
  if (ACTIVE_THEME === THEMES.neomorphism) {
    return { background: PALETTE_NEOMORPHISM.bg };
  }
  if (ACTIVE_THEME === THEMES.aura) {
    return { background: PALETTE_AURA.bg };
  }
  if (ACTIVE_THEME === THEMES.liquidGlass) {
    return {
      background: `
    radial-gradient(60% 50% at 20% 15%, rgba(255,140,60,0.25), transparent 65%),
    radial-gradient(55% 45% at 85% 80%, rgba(255,90,40,0.18), transparent 65%),
    linear-gradient(160deg, #2b1c14 0%, #1a1410 60%, #100c0a 100%)
  `,
    };
  }
  return { background: PALETTE_DEFAULT.bg };
})();
