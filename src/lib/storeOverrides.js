// src/lib/storeOverrides.js
//
// Fetches admin-set overrides (name/price edits on built-in items) and
// fully custom admin-added items from Firestore, so the Store UI can merge
// them onto the hardcoded BASE item list without the app needing its own
// admin-only write path — all writes happen from the admin panel via the
// Admin SDK (see focusly-admin-panel/api/store-items.js). Clients only ever
// read these two collections (see firestore.rules).
//
// LIVE-SYNCED (not one-time fetch): store pricing/items are edited from the
// separate admin panel while this app may already be open in someone's
// session, so this uses onSnapshot listeners rather than a single getDocs
// call — a change the admin makes shows up here within moments, without
// requiring the user to close and reopen the app. A shared in-memory cache
// is still kept (and pushed to every subscriber immediately if already
// populated) so repeated reads across components stay instant; only the
// underlying data source is now "live" instead of "fetch once forever".

import { useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

let cache = null; // { overrides: {id: {name?, price?}}, custom: [{id, name, price, imageUrl, pack}] }
const subscribers = new Set();
let overridesUnsub = null;
let customUnsub = null;
let latestOverrides = {};
let latestCustom = [];

function publish() {
  cache = { overrides: latestOverrides, custom: latestCustom };
  subscribers.forEach((cb) => cb(cache));
}

// Starts the live listeners exactly once (module-level, shared across every
// caller/component), so we don't open duplicate Firestore subscriptions
// per Store/hook instance.
function ensureListening() {
  if (overridesUnsub) return; // already listening

  overridesUnsub = onSnapshot(
    collection(db, "storeItemOverrides"),
    (snap) => {
      const overrides = {};
      snap.forEach((d) => { overrides[d.id] = d.data(); });
      latestOverrides = overrides;
      publish();
    },
    (err) => console.warn("storeItemOverrides listener error, keeping last known values:", err)
  );

  customUnsub = onSnapshot(
    collection(db, "storeItemsCustom"),
    (snap) => {
      latestCustom = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      publish();
    },
    (err) => console.warn("storeItemsCustom listener error, keeping last known values:", err)
  );
}

// Returns the current overrides/custom snapshot, subscribing `onUpdate` (if
// given) to receive every future live update too. Returns an unsubscribe
// function.
export function watchStoreOverrides(onUpdate) {
  ensureListening();
  if (onUpdate) {
    subscribers.add(onUpdate);
    if (cache) onUpdate(cache); // deliver whatever we already have immediately
  }
  return () => { if (onUpdate) subscribers.delete(onUpdate); };
}

// One-shot convenience for callers that just want the current value once
// (e.g. inside an async function) rather than a live subscription. Waits
// briefly for the first snapshot if the listeners haven't delivered yet.
export function loadStoreOverrides() {
  ensureListening();
  if (cache) return Promise.resolve(cache);
  return new Promise((resolve) => {
    const unsub = watchStoreOverrides((data) => {
      resolve(data);
      unsub();
    });
  });
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

// Convenience hook for anywhere that just needs the full FLAT item list
// (base items with overrides applied, plus custom items appended) rather
// than the pack-grouped structure — e.g. resolving a single item by id for
// "currently equipped mascot" or "owned items" lookups outside the Store
// panel itself (App.jsx header, Settings > Account/Customize panels).
// Live-updates automatically whenever the admin changes store items.
export function useAllStoreItems(baseItems) {
  const [items, setItems] = useState(baseItems);
  useEffect(() => {
    const unsub = watchStoreOverrides(({ overrides, custom }) => {
      const withOverrides = baseItems.map((item) => {
        const o = overrides[item.id];
        return o ? { ...item, name: o.name ?? item.name, price: o.price ?? item.price } : item;
      });
      const customAsItems = custom.map((c) => ({ id: c.id, name: c.name, price: c.price, img: c.imageUrl }));
      setItems([...withOverrides, ...customAsItems]);
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return items;
}
