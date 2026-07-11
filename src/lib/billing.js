// src/lib/billing.js
//
// Plans + AI message limits.
//
// NOTE: redeem codes are no longer parsed from their string format. A code
// is only ever valid if it exists as an admin-provisioned document in the
// `redeemCodes` Firestore collection (see redeemCode() in lib/firestore.js
// and scripts/generate-redeem-codes.js) — the plan and validity period for
// a code live on that document, not in the code text itself. This means a
// user-typed string can never self-authorize a plan upgrade just by
// matching an expected shape.

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
