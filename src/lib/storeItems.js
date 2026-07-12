// src/lib/storeItems.js
// All purchasable mascots, grouped into packs.
// `img` files live in /public/store/ (served from site root as /store/...).
//
// Pulled out of Store.jsx into its own tiny data module so App.jsx can read
// STORE_ITEMS (needed on first paint, to resolve the active mascot icon)
// without pulling in the whole Store component/UI code — that stays
// lazy-loaded and is only fetched when the Store modal is actually opened.
import { THEME_LIST } from "../themeDefinitions";

export const COSMIC_VOYAGER_PACK = [
  { id: "drago-astronaut", name: "Astronaut Drago", img: "/store/drago-astronaut.webp", price: 5 },
  { id: "drago-cosmic", name: "Cosmic Drago", img: "/store/drago-cosmic.webp", price: 10 },
  { id: "drago-supernova", name: "Supernova Drago", img: "/store/drago-supernova.webp", price: 15 },
];

export const MOOD_PACK = [
  { id: "mr-brightside", name: "Mr.Brightside", img: "/store/mr-brightside.webp", price: 35 },
  { id: "aha-moment", name: "The Aha Moment", img: "/store/aha-moment.webp", price: 200 },
  { id: "count-dragula", name: "Count Dragula", img: "/store/count-dragula.webp", price: 200 },
  { id: "kai-njuring", name: "The Kai-njuring", img: "/store/kai-njuring.webp", price: 125 },
  { id: "man-of-the-match", name: "Man of the Match", img: "/store/man-of-the-match.webp", price: 100 },
  { id: "sweating-bullets", name: "Sweating Bullets", img: "/store/sweating-bullets.webp", price: 300 },
  { id: "family-disappointment", name: "Family Disappointment", img: "/store/family-disappointment.webp", price: 500 },
];

export const BLACK_PACK = [
  { id: "black-skeleton", name: "Eclipse Reaper", img: "/store/black-skeleton.webp", price: 900 },
  { id: "black-allseeing", name: "All-Seeing Coil", img: "/store/black-allseeing.webp", price: 500 },
  { id: "black-sunmoon", name: "Solstice Oracle", img: "/store/black-sunmoon.webp", price: 500 },
  { id: "black-mystic-eye", name: "Mystic Sigil Eye", img: "/store/black-mystic-eye.webp", price: 500 },
  { id: "black-eye-star", name: "Starlit Watcher", img: "/store/black-eye-star.webp", price: 500 },
  { id: "black-yinyang", name: "Serpent Balance", img: "/store/black-yinyang.webp", price: 500 },
];

// App-wide visual themes (e.g. "Glass"), purchasable/equippable the same
// way as mascots but stored under a distinct id namespace ("theme:<id>")
// so a theme id never collides with a mascot id in ownedItems/activeMascot.
export const APP_THEMES_PACK = THEME_LIST
  .filter((t) => !t.default)
  .map((t) => ({
    id: `theme:${t.id}`,
    themeId: t.id,
    name: `${t.name} Theme`,
    price: t.price,
    isTheme: true,
    preview: t.preview,
  }));

// Flat lookup used elsewhere in the app (e.g. resolving the active mascot image).
export const STORE_ITEMS = [...COSMIC_VOYAGER_PACK, ...MOOD_PACK, ...BLACK_PACK];

export const PACKS = [
  { title: "App Themes", items: APP_THEMES_PACK, layout: "theme" },
  { title: "Cosmic Voyager Theme Pack", items: COSMIC_VOYAGER_PACK, layout: "grid" },
  { title: "Mood Pack", items: MOOD_PACK, layout: "list" },
  { title: "Black", items: BLACK_PACK, layout: "grid" },
];
