// src/lib/notifications.js
//
// In-app notifications sent by the admin panel. Separate from OneSignal
// push (src/lib/median.js) — this is what powers the bell icon on the
// Dashboard: a live list stored per-user in Firestore, which can carry a
// claimable reward (coins, XP, or a store item/mascot) alongside a plain
// message.
//
// users/{uid}/notifications/{notifId} = {
//   type: "message" | "coins" | "xp" | "item",
//   title: string,
//   body: string,
//   amount: number | null,   // for type "coins" / "xp"
//   itemId: string | null,   // for type "item" — an id from lib/storeItems.js
//   claimed: boolean,        // only meaningful for coins/xp/item
//   read: boolean,
//   createdAt: server timestamp,
// }
//
// Written by the admin panel's api/send-notification.js via the Admin SDK
// (bypasses firestore.rules entirely, same as every other admin write) —
// the client only ever reads its own notifications and writes `read`/
// `claimed`/deletes on its own subcollection, per firestore.rules.

import {
  collection, doc, deleteDoc, getDocs, writeBatch, onSnapshot,
  query, orderBy, runTransaction, increment,
} from "firebase/firestore";
import { db } from "../firebase";

const CHUNK = 450; // stay under Firestore's 500-write batch cap

export function watchNotifications(uid, cb) {
  const ref = collection(db, "users", uid, "notifications");
  const q = query(ref, orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

// Marks every currently-unread notification as read (called when the
// panel is opened, so the bell badge clears).
export async function markAllRead(uid, notifications) {
  const unread = notifications.filter((n) => !n.read);
  if (unread.length === 0) return;
  for (let i = 0; i < unread.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const n of unread.slice(i, i + CHUNK)) {
      batch.update(doc(db, "users", uid, "notifications", n.id), { read: true });
    }
    await batch.commit();
  }
}

export async function deleteAllNotifications(uid) {
  const ref = collection(db, "users", uid, "notifications");
  const snap = await getDocs(ref);
  if (snap.empty) return;
  for (let i = 0; i < snap.docs.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const d of snap.docs.slice(i, i + CHUNK)) batch.delete(d.ref);
    await batch.commit();
  }
}

export async function deleteNotification(uid, notifId) {
  await deleteDoc(doc(db, "users", uid, "notifications", notifId));
}

// Claims a reward notification (coins / xp / item), crediting it to the
// user's own doc. Wrapped in a transaction — same reasoning as addXp in
// lib/firestore.js — so double-tapping "Claim" (or two open tabs) can
// never credit the same reward twice: the `claimed` flag is read and
// flipped atomically with the credit.
export async function claimNotification(uid, notifId) {
  const notifRef = doc(db, "users", uid, "notifications", notifId);
  const userRef = doc(db, "users", uid);

  await runTransaction(db, async (tx) => {
    const notifSnap = await tx.get(notifRef);
    if (!notifSnap.exists()) return;
    const n = notifSnap.data();
    if (n.claimed) return;

    // All reads must happen before any writes in a Firestore transaction,
    // so the (conditional) user-doc read for the "item" case happens here,
    // before any tx.set/tx.update below.
    let userSnap = null;
    if (n.type === "item") {
      userSnap = await tx.get(userRef);
    }

    if (n.type === "coins" && n.amount) {
      tx.set(userRef, { coins: increment(n.amount) }, { merge: true });
    } else if (n.type === "xp" && n.amount) {
      tx.set(userRef, { xp: increment(n.amount) }, { merge: true });
    } else if (n.type === "item" && n.itemId) {
      const owned = userSnap?.exists() ? (userSnap.data().ownedItems || []) : [];
      if (!owned.includes(n.itemId)) {
        tx.set(userRef, { ownedItems: [...owned, n.itemId] }, { merge: true });
      }
    }

    tx.update(notifRef, { claimed: true, read: true });
  });
}
