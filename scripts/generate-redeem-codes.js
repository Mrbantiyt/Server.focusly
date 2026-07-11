// scripts/generate-redeem-codes.js
//
// ADMIN-ONLY tool for provisioning authorized redeem codes. This is the
// ONLY supported way a redeem code should ever come into existence — the
// app itself (src/lib/firestore.js -> redeemCode()) never creates a
// redeemCodes doc, it only ever flips an existing one from used:false to
// used:true. Firestore security rules also block clients from creating
// redeemCodes docs at all (see firestore.rules), so this script, run with
// the Admin SDK, is the intended path around that restriction.
//
// This directly fixes the old vulnerability where any string that merely
// LOOKED like a code (e.g. "FOCUSMAX30HAHBAB") was accepted: redemption
// now only succeeds if the exact code exists here first.
//
// Usage:
//   FIREBASE_SERVICE_ACCOUNT_KEY='<service account JSON as one line>' \
//     node scripts/generate-redeem-codes.js --plan=max --days=30 --count=10
//
//   --plan   "team" or "max" (required)
//   --days   validity in days, a positive integer (required)
//   --count  how many codes to generate (default: 1)
//   --prefix optional human-readable prefix, e.g. "FOCUSMAX30" (cosmetic
//            only — it plays no role in validation, unlike the old system)
//
// Prints every generated code to stdout so the admin can distribute them.

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import crypto from "crypto";

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!raw) {
  console.error("FIREBASE_SERVICE_ACCOUNT_KEY env var is required.");
  process.exit(1);
}

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const plan = (args.plan || "").toLowerCase();
const days = parseInt(args.days, 10);
const count = args.count ? parseInt(args.count, 10) : 1;
const prefix = args.prefix ? args.prefix.toUpperCase().replace(/[^A-Z0-9]/g, "") : "FOCUS";

if (plan !== "team" && plan !== "max") {
  console.error('--plan must be "team" or "max"');
  process.exit(1);
}
if (!Number.isFinite(days) || days <= 0) {
  console.error("--days must be a positive integer");
  process.exit(1);
}
if (!Number.isFinite(count) || count <= 0) {
  console.error("--count must be a positive integer");
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();

// Random suffix only — never parsed or trusted for plan/days at redemption
// time. It exists purely so codes are unguessable and look distinct from
// one another.
function randomSuffix(len = 10) {
  return crypto.randomBytes(len).toString("base64url").toUpperCase().slice(0, len);
}

async function main() {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const code = `${prefix}${randomSuffix()}`;
    const ref = db.collection("redeemCodes").doc(code);
    // Extremely unlikely to collide, but guard against it anyway rather
    // than silently overwriting an existing authorized code.
    // eslint-disable-next-line no-await-in-loop
    const existing = await ref.get();
    if (existing.exists) {
      i--; // try again with a fresh random suffix
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    await ref.set({
      plan,
      days,
      used: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    codes.push(code);
  }

  console.log(`Generated ${codes.length} ${plan} / ${days}-day code(s):`);
  codes.forEach((c) => console.log(c));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
