// src/lib/storeOverrides.js
//
// Fetches admin-set overrides (name/price edits on built-in items) and
// fully custom admin-added items from Firestore, so the Store UI can merge
// them onto the hardcoded BASE item list without the app needing its own
// admin-only write path — all writes happen from the admin panel via the
// Admin SDK (see focusly-admin-panel/api/store-items.js). Clients only ever
// read these two collections (see firestore.rules).
//
// Fetched once per app session (not live-subscribed) since store pricing
// changes are infrequent and this only needs to be fresh-ish, not realtime.

import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

let cache = null; // { overrides: {id: {name?, price?}}, custom: [{id, name, price, imageUrl, pack}] }
let inflight = null;

export async function loadStoreOverrides() {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const [overridesSnap, customSnap] = await Promise.all([
        getDocs(collection(db, "storeItemOverrides")),
        getDocs(collection(db, "storeItemsCustom")),
      ]);

      const overrides = {};
      overridesSnap.forEach((d) => {
        overrides[d.id] = d.data();
      });

      const custom = customSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      cache = { overrides, custom };
      return cache;
    } catch (e) {
      // If this fails (offline, rules issue, etc.), fall back to an empty
      // result so the store still renders with just the hardcoded items.
      console.warn("Failed to load store overrides, using built-in items only:", e);
      cache = { overrides: {}, custom: [] };
      return cache;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

// Applies loaded overrides/custom items onto a base pack list.
// `packs` is [{ title, items, layout }], `items` are the hardcoded arrays
// from Store.jsx. Returns a new packs array; does not mutate the input.
export function applyStoreOverrides(packs, { overrides, custom }) {
  const merged = packs.map((pack) => ({
    ...pack,
    items: pack.items.map((item) => {
      const o = overrides[item.id];
      if (!o) return item;
      return { ...item, name: o.name ?? item.name, price: o.price ?? item.price };
    }),
  }));

  // Group custom items by pack name, adding to an existing pack (matched by
  // title) or creating a new one if the admin typed a pack name that
  // doesn't exist yet.
  for (const c of custom) {
    const packItem = { id: c.id, name: c.name, price: c.price, img: c.imageUrl };
    const existingPack = merged.find((p) => p.title === c.pack);
    if (existingPack) {
      existingPack.items = [...existingPack.items, packItem];
    } else {
      merged.push({ title: c.pack, items: [packItem], layout: "grid" });
    }
  }

  return merged;
}
