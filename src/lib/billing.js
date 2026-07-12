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

// Daily "Ask AI" TIME allowance per plan, in minutes. `null` = unlimited.
// (Previously this was a message-count limit; the AI screen now embeds an
// external chat we can't count messages in, so time-open is what we can
// actually measure and enforce.)
export const AI_TIME_LIMITS_MIN = {
  [PLAN.FREE]: 30,
  [PLAN.TEAM]: 60,
  [PLAN.MAX]: null, // unlimited
};

export function getAiTimeLimitSeconds(billing) {
  const mins = AI_TIME_LIMITS_MIN[getEffectivePlan(billing)];
  return mins === null ? null : mins * 60;
}

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

// Kept for backward compatibility with any screen still importing this
// (e.g. Settings.jsx) — now returns the time limit in MINUTES instead of a
// message count, since usage is tracked by time, not message count.
export function getAiMessageLimit(billing) {
  return AI_TIME_LIMITS_MIN[getEffectivePlan(billing)];
}

// Days remaining on the current plan (0 if free / expired).
export function getDaysRemaining(billing) {
  if (getEffectivePlan(billing) === PLAN.FREE) return 0;
  const expiresAtMs = billing.expiresAt?.toMillis ? billing.expiresAt.toMillis() : new Date(billing.expiresAt).getTime();
  return Math.max(0, Math.ceil((expiresAtMs - Date.now()) / (24 * 60 * 60 * 1000)));
}
