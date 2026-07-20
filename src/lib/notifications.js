// src/lib/notifications.js
//
// In-app notifications sent by the admin panel. Separate from OneSignal
// push (src/lib/median.js) — this is what powers the bell icon on the
// Dashboard: a live list stored per-user in Firestore, which can carry a
// claimable reward (coins, XP, or a store item/mascot) alongside a plain
// message.
//
// users/{uid}/notifications/{notifId} = {
//   type: "message" | "coins" | "xp" | "item" | "achievement",
//   title: string,
//   body: string,
//   amount: number | null,   // for type "coins" / "xp"
//   itemId: string | null,   // for type "item" — an id from lib/storeItems.js
//   claimed: boolean,        // only meaningful for coins/xp/item — for
//                            // "achievement" this is always true (see below)
//   read: boolean,
//   createdAt: server timestamp,
//   // "achievement"-only fields:
//   achievementId: string | null,   // which achievement this celebrates
//   coinsAwarded: number | null,    // coins actually credited (may be 0)
//   xpAwarded: number | null,       // xp actually credited (may be 0)
// }
//
// Every type except "achievement" is written by the admin panel's
// api/send-notification.js via the Admin SDK (bypasses firestore.rules
// entirely, same as every other admin write). "achievement" notifications
// are the one type the client creates itself (see notifyAchievementUnlocked
// below) — the client only ever reads its own notifications and writes
// `read`/`claimed`/deletes on its own subcollection otherwise, per
// firestore.rules.

import {
  collection, doc, addDoc, deleteDoc, getDocs, writeBatch, onSnapshot,
  query, orderBy, runTransaction, increment, serverTimestamp,
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

// Writes a durable "you unlocked X" record to the bell/notifications panel
// the moment an achievement is unlocked (called from useAchievements.js,
// right after unlockAchievements() successfully credits the reward). This
// is NOT a claimable grant — claimed is always true, since the coins/xp
// were already credited by that same unlock transaction. It exists purely
// so the achievement shows up later in Notifications (per the person's
// request: "achievement complete hone par notification mein bhi aaye,
// naam + reward ke saath"), not to grant anything a second time.
//
// Best-effort: if this write fails (e.g. offline), the achievement is
// still unlocked and paid — the person just won't see a notification
// entry for it, which is a much smaller loss than blocking or duplicating
// the reward itself. Errors are swallowed for that reason.
export async function notifyAchievementUnlocked(uid, achievement, { coinsAwarded, xpAwarded }) {
  try {
    const ref = collection(db, "users", uid, "notifications");
    await addDoc(ref, {
      type: "achievement",
      title: "Achievement unlocked!",
      body: achievement.name,
      achievementId: achievement.id,
      coinsAwarded: coinsAwarded || 0,
      xpAwarded: xpAwarded || 0,
      claimed: true,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn("[notifications] Failed to record achievement notification:", err);
  }
}
