// src/components/Store.jsx
import React, { useEffect, useState } from "react";
import { X, Check } from "lucide-react";
import { COL, neu, cacheActiveTheme } from "../theme";
import { purchaseItem, setActiveMascot, purchaseTheme, setActiveTheme } from "../lib/firestore";
import { fmtCompact } from "../lib/time";
import { watchStoreOverrides, applyStoreOverrides } from "../lib/storeOverrides";
import StoreIntroAnimation from "./StoreIntroAnimation";

// All purchasable mascots, grouped into packs.
// `img` files live in /public/store/ (served from site root as /store/...).
const COSMIC_VOYAGER_PACK = [
  { id: "drago-astronaut", name: "Astronaut Drago", img: "/store/drago-astronaut.png", price: 5 },
  { id: "drago-cosmic", name: "Cosmic Drago", img: "/store/drago-cosmic.png", price: 10 },
  { id: "drago-supernova", name: "Supernova Drago", img: "/store/drago-supernova.png", price: 15 },
];

const MOOD_PACK = [
  { id: "mr-brightside", name: "Mr.Brightside", img: "/store/mr-brightside.png", price: 35 },
  { id: "aha-moment", name: "The Aha Moment", img: "/store/aha-moment.png", price: 200 },
  { id: "count-dragula", name: "Count Dragula", img: "/store/count-dragula.png", price: 200 },
  { id: "kai-njuring", name: "The Kai-njuring", img: "/store/kai-njuring.png", price: 125 },
  { id: "man-of-the-match", name: "Man of the Match", img: "/store/man-of-the-match.png", price: 100 },
  { id: "sweating-bullets", name: "Sweating Bullets", img: "/store/sweating-bullets.png", price: 300 },
  { id: "family-disappointment", name: "Family Disappointment", img: "/store/family-disappointment.png", price: 500 },
];

const BLACK_PACK = [
  { id: "black-skeleton", name: "Eclipse Reaper", img: "/store/black-skeleton.png", price: 900 },
  { id: "black-allseeing", name: "All-Seeing Coil", img: "/store/black-allseeing.png", price: 500 },
  { id: "black-sunmoon", name: "Solstice Oracle", img: "/store/black-sunmoon.png", price: 500 },
  { id: "black-mystic-eye", name: "Mystic Sigil Eye", img: "/store/black-mystic-eye.png", price: 500 },
  { id: "black-eye-star", name: "Starlit Watcher", img: "/store/black-eye-star.png", price: 500 },
  { id: "black-yinyang", name: "Serpent Balance", img: "/store/black-yinyang.png", price: 500 },
];

// Whole-app UI themes. Separate from the mascot packs above: these swap
// every card/surface in the app (see theme.js), cost a lot more, and — per
// product decision — only take visual effect after the app is restarted,
// so they get their own purchase/equip handling below rather than sharing
// the mascot buy/equip flow.
export const THEME_PACK = [
  { id: "liquidGlass", name: "Glassmorphism", img: "/store/theme-liquid-glass.png", price: 50000 },
  { id: "neomorphism", name: "Neomorphism", img: "/store/theme-neomorphism.png", price: 50000 },
];

// Flat lookup of the hardcoded (built-in) items only — used at first paint
// (App.jsx resolving the active mascot image) before any admin overrides
// have loaded. May have stale name/price if an admin edited those, but the
// id/img are always correct since only name/price can be overridden.
export const STORE_ITEMS = [...COSMIC_VOYAGER_PACK, ...MOOD_PACK, ...BLACK_PACK];

const BASE_PACKS = [
  { title: "Cosmic Voyager Theme Pack", items: COSMIC_VOYAGER_PACK, layout: "grid" },
  { title: "Mood Pack", items: MOOD_PACK, layout: "list" },
  { title: "Black", items: BLACK_PACK, layout: "grid" },
];

function CoinPill({ value }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: COL.card }}>
      <span className="w-4 h-4 rounded-full flex items-center justify-center font-bold text-[9px]"
        style={{ background: "#F5B301", color: "#fff" }}>F</span>
      <span className="font-display font-bold text-sm" style={{ color: "#F5B301" }}>{value}</span>
    </div>
  );
}

export default function Store({ uid, coins, ownedItems, activeMascot, ownedThemes, activeTheme, onClose }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [packs, setPacks] = useState(BASE_PACKS);
  const [allItems, setAllItems] = useState(STORE_ITEMS);
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    // Live subscription: if the admin edits an item's price/name or adds a
    // new custom item while this Store screen is already open, it updates
    // here automatically — no need to close and reopen the Store.
    const unsub = watchStoreOverrides((result) => {
      const merged = applyStoreOverrides(BASE_PACKS, result);
      setPacks(merged);
      setAllItems(merged.flatMap((p) => p.items));
    });
    return unsub;
  }, []);

  const owned = ownedItems || [];
  // Optimistic layer: item ids we've locally marked as owned before the
  // server transaction confirms, so the button flips to "Owned" instantly
  // instead of sitting on the spinner for the full round-trip (purchaseItem
  // uses runTransaction, which — unlike a plain setDoc/updateDoc — does NOT
  // get Firestore's local-cache optimistic playback, so without this the UI
  // would visibly wait on every purchase). Cleared automatically once the
  // real `owned` prop (driven by the live onSnapshot in useGameStats) catches
  // up, or rolled back immediately if the purchase fails.
  const [optimisticOwned, setOptimisticOwned] = useState([]);
  const displayOwned = [...owned, ...optimisticOwned.filter((id) => !owned.includes(id))];

  async function handleBuy(item) {
    if (!uid || busyId) return;
    setError(null);
    setBusyId(item.id);
    setOptimisticOwned((prev) => [...prev, item.id]); // show "Owned" immediately
    const res = await purchaseItem(uid, item.id, item.price);
    setBusyId(null);
    if (!res.ok) {
      // Roll back: purchase failed server-side, so undo the optimistic mark.
      setOptimisticOwned((prev) => prev.filter((id) => id !== item.id));
      setError(res.reason === "not-enough-coins" ? "Not enough coins" : "Something went wrong");
    }
    // On success we leave the optimistic entry in place until `owned` (from
    // the live snapshot) includes it too — displayOwned already de-dupes.
  }

  async function handleEquip(itemId) {
    if (!uid) return;
    await setActiveMascot(uid, itemId);
  }

  const collection = allItems.filter((it) => displayOwned.includes(it.id));

  // ---- Whole-app themes (separate bookkeeping from mascots — see THEME_PACK) ----
  const ownedThemeIds = ownedThemes || [];
  const [busyThemeId, setBusyThemeId] = useState(null);
  const [themeError, setThemeError] = useState(null);
  // Same optimistic-ownership pattern as mascots (purchaseTheme also uses
  // runTransaction, so it doesn't get Firestore's local-cache optimistic
  // playback either) plus a one-off "pending equip" flag so tapping
  // "Use" on a theme can show a "Restart to apply" confirmation instead of
  // silently doing nothing visible.
  const [optimisticOwnedThemes, setOptimisticOwnedThemes] = useState([]);
  const [justEquippedTheme, setJustEquippedTheme] = useState(null);
  const displayOwnedThemes = [...ownedThemeIds, ...optimisticOwnedThemes.filter((id) => !ownedThemeIds.includes(id))];

  async function handleBuyTheme(theme) {
    if (!uid || busyThemeId) return;
    setThemeError(null);
    setBusyThemeId(theme.id);
    setOptimisticOwnedThemes((prev) => [...prev, theme.id]);
    const res = await purchaseTheme(uid, theme.id, theme.price);
    setBusyThemeId(null);
    if (!res.ok) {
      setOptimisticOwnedThemes((prev) => prev.filter((id) => id !== theme.id));
      setThemeError(res.reason === "not-enough-coins" ? "Not enough coins" : "Something went wrong");
    }
  }

  async function handleEquipTheme(themeId) {
    if (!uid) return;
    // Cache immediately (don't wait for the Firestore write to round-trip
    // back through App.jsx's snapshot-driven effect) so "Reload now" is
    // instant and correct even on a slow connection.
    cacheActiveTheme(themeId);
    await setActiveTheme(uid, themeId);
    setJustEquippedTheme(themeId);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,18,40,0.55)" }}>
      <div className="relative w-full max-w-sm max-h-[90vh] rounded-[28px] overflow-hidden">
        <div className="w-full h-full max-h-[90vh] overflow-y-auto p-6" style={{ background: COL.bg }}>
        <div className="flex items-center justify-between mb-6">
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full" style={neu(false, 999)}>
            <X size={16} color={COL.sub} />
          </button>
          <span className="font-display font-bold text-lg" style={{ color: COL.ink }}>Store</span>
          <div style={neu(false, 999)} className="flex items-center gap-1.5 px-3 py-1.5">
            <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold text-[9px]"
              style={{ background: "#F5B301", color: "#fff" }}>F</span>
            <span className="font-display font-bold text-xs" style={{ color: COL.ink }}>{fmtCompact(coins)}</span>
          </div>
        </div>

        {error && (
          <div className="mb-3 px-3 py-2 rounded-xl font-body text-xs text-center" style={{ background: "rgba(255,122,133,0.15)", color: COL.coral }}>
            {error}
          </div>
        )}

        {packs.map((pack) => (
          <div key={pack.title} className="mb-6">
            <div className="font-display font-semibold text-base mb-3" style={{ color: COL.ink }}>
              {pack.title}
            </div>

            {pack.layout === "grid" ? (
              <div className="grid grid-cols-2 gap-3">
                {pack.items.map((item) => {
                  const isOwned = displayOwned.includes(item.id);
                  const isBusy = busyId === item.id;
                  return (
                    <div key={item.id} style={neu(false, 20)} className="p-3 flex flex-col items-center text-center">
                      <img src={item.img} alt={item.name} className="w-20 h-20 rounded-2xl object-cover mb-2" />
                      <div className="font-display font-semibold text-xs mb-2" style={{ color: COL.ink }}>{item.name}</div>
                      {isOwned ? (
                        <div className="w-full flex items-center justify-center gap-1 px-3 py-1.5 rounded-full font-display font-bold text-xs"
                          style={{ background: "rgba(63,207,163,0.15)", color: COL.mint }}>
                          <Check size={12} /> Owned
                        </div>
                      ) : (
                        <button
                          onClick={() => handleBuy(item)}
                          disabled={isBusy}
                          style={neu(false, 999)}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 active:scale-95 transition disabled:opacity-60"
                        >
                          <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold text-[9px]"
                            style={{ background: "#F5B301", color: "#fff" }}>F</span>
                          <span className="font-display font-bold text-xs" style={{ color: COL.ink }}>
                            {isBusy ? "…" : item.price}
                          </span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {pack.items.map((item) => {
                  const isOwned = displayOwned.includes(item.id);
                  const isBusy = busyId === item.id;
                  return (
                    <div key={item.id} style={neu(false, 22)} className="flex items-center gap-3 p-3">
                      <img src={item.img} alt={item.name} className="w-14 h-14 rounded-2xl object-cover flex-shrink-0" />
                      <div className="flex-1 font-display font-semibold text-sm" style={{ color: COL.ink }}>
                        {item.name}
                      </div>
                      {isOwned ? (
                        <div className="flex items-center gap-1 px-3 py-1.5 rounded-full font-display font-bold text-xs flex-shrink-0"
                          style={{ background: "rgba(63,207,163,0.15)", color: COL.mint }}>
                          <Check size={12} /> Owned
                        </div>
                      ) : (
                        <button
                          onClick={() => handleBuy(item)}
                          disabled={isBusy}
                          className="flex-shrink-0 active:scale-95 transition disabled:opacity-60"
                        >
                          <CoinPill value={isBusy ? "…" : item.price} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        <div className="mb-6">
          <div className="font-display font-semibold text-base mb-1" style={{ color: COL.ink }}>
            App Themes
          </div>
          <div className="font-body text-[11px] mb-3" style={{ color: COL.sub }}>
            Restyles the whole app. Applies after you restart Focusly.
          </div>

          {themeError && (
            <div className="mb-3 px-3 py-2 rounded-xl font-body text-xs text-center" style={{ background: "rgba(255,122,133,0.15)", color: COL.coral }}>
              {themeError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {THEME_PACK.map((theme) => {
              const isOwned = displayOwnedThemes.includes(theme.id);
              const isBusy = busyThemeId === theme.id;
              return (
                <div key={theme.id} style={neu(false, 20)} className="p-3 flex flex-col items-center text-center">
                  <img src={theme.img} alt={theme.name} className="w-20 h-20 rounded-2xl object-cover mb-2" />
                  <div className="font-display font-semibold text-xs mb-2" style={{ color: COL.ink }}>{theme.name}</div>
                  {isOwned ? (
                    <div className="w-full flex items-center justify-center gap-1 px-3 py-1.5 rounded-full font-display font-bold text-xs"
                      style={{ background: "rgba(63,207,163,0.15)", color: COL.mint }}>
                      <Check size={12} /> Owned
                    </div>
                  ) : (
                    <button
                      onClick={() => handleBuyTheme(theme)}
                      disabled={isBusy}
                      style={neu(false, 999)}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 active:scale-95 transition disabled:opacity-60"
                    >
                      <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold text-[9px]"
                        style={{ background: "#F5B301", color: "#fff" }}>F</span>
                      <span className="font-display font-bold text-xs" style={{ color: COL.ink }}>
                        {isBusy ? "…" : fmtCompact(theme.price)}
                      </span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {displayOwnedThemes.length > 0 && (
            <div className="mt-4">
              <div className="font-display font-semibold text-sm mb-2" style={{ color: COL.ink }}>
                My Themes
              </div>
              <div className="flex flex-col gap-2">
                {THEME_PACK.filter((t) => displayOwnedThemes.includes(t.id)).map((theme) => {
                  const isActive = activeTheme === theme.id;
                  return (
                    <div key={theme.id} className="flex flex-col gap-1">
                      <button
                        onClick={() => handleEquipTheme(theme.id)}
                        style={neu(false, 18)}
                        className="flex items-center gap-3 p-2.5 active:scale-95 transition"
                      >
                        <img src={theme.img} alt={theme.name} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
                        <span className="flex-1 text-left font-display font-semibold text-xs" style={{ color: COL.ink }}>
                          {theme.name}
                        </span>
                        <span className="font-body text-[10px] flex-shrink-0" style={{ color: isActive ? COL.violet : COL.sub }}>
                          {isActive ? "Equipped" : "Use"}
                        </span>
                      </button>
                      {justEquippedTheme === theme.id && (
                        <div className="flex items-center justify-between gap-2 px-2.5">
                          <span className="font-body text-[10px]" style={{ color: COL.gold }}>
                            Restart Focusly to apply this theme.
                          </span>
                          <button
                            onClick={() => window.location.reload()}
                            className="flex-shrink-0 px-2.5 py-1 rounded-full font-display font-bold text-[10px] active:scale-95 transition"
                            style={{ background: COL.violet, color: "#fff" }}
                          >
                            Reload now
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="font-display font-semibold text-base mb-3" style={{ color: COL.ink }}>
          My Collection
        </div>

        {collection.length === 0 ? (
          <div style={{ ...neu(true, 20), color: COL.sub }} className="p-5 text-center font-body text-xs">
            Nothing here yet — buy a theme above to unlock it.
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {collection.map((item) => {
              const active = activeMascot === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleEquip(item.id)}
                  className="flex flex-col items-center gap-1 active:scale-95 transition"
                >
                  <div
                    className="w-14 h-14 rounded-2xl overflow-hidden"
                    style={{
                      boxShadow: active
                        ? `0 0 0 2px ${COL.violet}, 4px 4px 10px rgba(163,170,199,0.4)`
                        : "4px 4px 10px rgba(163,170,199,0.4), -4px -4px 10px rgba(255,255,255,0.85)",
                    }}
                  >
                    <img src={item.img} alt={item.name} className="w-full h-full object-cover" />
                  </div>
                  <span className="font-body text-[10px]" style={{ color: active ? COL.violet : COL.sub }}>
                    {active ? "In use" : "Use"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        </div>
        {showIntro && <StoreIntroAnimation onDone={() => setShowIntro(false)} />}
      </div>
    </div>
  );
}
