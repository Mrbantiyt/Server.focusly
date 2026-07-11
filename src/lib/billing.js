// src/lib/billing.js
//
// Plans + AI message limits + redeem-code parsing.
//
// Redeem code format (case-insensitive, trailing junk ignored):
//   FOCUS  +  TEAM|MAX  +  <digits = validity in days>  +  anything
//   e.g. "FOCUSTEAM30XYZ123" -> team plan, 30 days
//        "FOCUSMAX90ABC999"  -> max plan,  90 days
//
// Only the prefix is validated — whatever comes after the digits is
// ignored, so codes can carry a random-looking suffix (for uniqueness)
// without any of that suffix needing to mean anything.

export const PLAN = { FREE: "free", TEAM: "team", MAX: "max" };

// Daily "Ask AI" message allowance per plan.
export const AI_MESSAGE_LIMITS = {
  [PLAN.FREE]: 5,
  [PLAN.TEAM]: 25,
  [PLAN.MAX]: 50,
};

export const PLAN_LABELS = {
  [PLAN.FREE]: "Free",
  [PLAN.TEAM]: "Team",
  [PLAN.MAX]: "Max",
};

// Matches "FOCUS" + ("TEAM"|"MAX") + one-or-more digits, anything after
// that is ignored. Case-insensitive; caller should also trim whitespace.
const CODE_PATTERN = /^FOCUS(TEAM|MAX)(\d+)/i;

// Parses a raw redeem code string into { plan, days } or returns null if
// it doesn't match the expected shape. Does NOT check whether the code
// has already been redeemed — that's a Firestore-side check (see
// redeemCode() in lib/firestore.js) since it requires a round trip.
export function parseRedeemCode(rawCode) {
  const code = (rawCode || "").trim().toUpperCase();
  const match = CODE_PATTERN.exec(code);
  if (!match) return null;

  const planWord = match[1].toUpperCase(); // "TEAM" | "MAX"
  const days = parseInt(match[2], 10);
  if (!Number.isFinite(days) || days <= 0) return null;

  return {
    code,
    plan: planWord === "TEAM" ? PLAN.TEAM : PLAN.MAX,
    days,
  };
}

// `billing` is the raw Firestore field: { plan, activatedAt, expiresAt, lastRedeemedCode }.
// Returns the plan that's ACTUALLY in effect right now — a paid plan whose
// expiresAt has passed silently behaves like Free again (no separate
// "downgrade" write needed anywhere).
export function getEffectivePlan(billing) {
  if (!billing?.plan || billing.plan === PLAN.FREE) return PLAN.FREE;
  const expiresAtMs = billing.expiresAt?.toMillis
    ? billing.expiresAt.toMillis()
    : billing.expiresAt
    ? new Date(billing.expiresAt).getTime()
    : 0;
  if (!expiresAtMs || expiresAtMs < Date.now()) return PLAN.FREE;
  return billing.plan;
}

export function getAiMessageLimit(billing) {
  return AI_MESSAGE_LIMITS[getEffectivePlan(billing)];
}

// Days remaining on the current plan (0 if free / expired).
export function getDaysRemaining(billing) {
  if (getEffectivePlan(billing) === PLAN.FREE) return 0;
  const expiresAtMs = billing.expiresAt?.toMillis ? billing.expiresAt.toMillis() : new Date(billing.expiresAt).getTime();
  return Math.max(0, Math.ceil((expiresAtMs - Date.now()) / (24 * 60 * 60 * 1000)));
}
