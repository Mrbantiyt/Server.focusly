// src/components/Store.jsx
import React, { useState } from "react";
import { X, Check } from "lucide-react";
import { COL, neu } from "../theme";
import { purchaseItem, setActiveMascot } from "../lib/firestore";
import { fmtCompact } from "../lib/time";

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

// Flat lookup used elsewhere in the app (e.g. resolving the active mascot image).
export const STORE_ITEMS = [...COSMIC_VOYAGER_PACK, ...MOOD_PACK, ...BLACK_PACK];

const PACKS = [
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

export default function Store({ uid, coins, ownedItems, activeMascot, onClose }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const owned = ownedItems || [];

  async function handleBuy(item) {
    if (!uid || busyId) return;
    setError(null);
    setBusyId(item.id);
    const res = await purchaseItem(uid, item.id, item.price);
    setBusyId(null);
    if (!res.ok) {
      setError(res.reason === "not-enough-coins" ? "Not enough coins" : "Something went wrong");
    }
  }

  async function handleEquip(itemId) {
    if (!uid) return;
    await setActiveMascot(uid, itemId);
  }

  const collection = STORE_ITEMS.filter((it) => owned.includes(it.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,18,40,0.55)" }}>
      <div className="w-full max-w-sm rounded-[28px] p-6 max-h-[90vh] overflow-y-auto" style={{ background: COL.bg }}>
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

        {PACKS.map((pack) => (
          <div key={pack.title} className="mb-6">
            <div className="font-display font-semibold text-base mb-3" style={{ color: COL.ink }}>
              {pack.title}
            </div>

            {pack.layout === "grid" ? (
              <div className="grid grid-cols-2 gap-3">
                {pack.items.map((item) => {
                  const isOwned = owned.includes(item.id);
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
                  const isOwned = owned.includes(item.id);
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

        <div className="font-display font-semibold text-base mb-3" style={{ color: COL.ink }}>
          My Collection
        </div>

        {collection.length === 0 ? (
          <div style={neu(true, 20)} className="p-5 text-center font-body text-xs" style={{ color: COL.sub }}>
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
    </div>
  );
}
