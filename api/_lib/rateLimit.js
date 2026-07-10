// api/_lib/rateLimit.js
//
// Shared per-user rate limiter for expensive/abusable endpoints (AI chat,
// uploads). Uses Upstash Redis (serverless-friendly, works fine from
// Vercel functions — a normal Redis connection would not, since Vercel
// functions are stateless/short-lived).
//
// Requires two env vars (from the Upstash dashboard, see README):
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
//
// If those env vars are missing, this fails OPEN (allows the request) so a
// misconfigured env doesn't take the whole app down — but it logs a
// warning so you notice in the Vercel function logs.

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let ratelimiters = {};

function getLimiter(name, requests, windowSeconds) {
  const key = `${name}:${requests}:${windowSeconds}`;
  if (ratelimiters[key]) return ratelimiters[key];

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.warn(
      `[rateLimit] UPSTASH_REDIS_REST_URL/TOKEN not set — rate limiting for "${name}" is DISABLED.`
    );
    ratelimiters[key] = null;
    return null;
  }

  const redis = new Redis({ url, token });
  ratelimiters[key] = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, `${windowSeconds} s`),
    prefix: `focusly:ratelimit:${name}`,
  });
  return ratelimiters[key];
}

// Call after requireAuth() so you have a stable per-user identity (uid) to
// key on — rate limiting by IP alone is easy to dodge and also unfair to
// users sharing a NAT/campus network.
//
// Returns { success, remaining, reset } — if success is false, the caller
// should return 429 immediately.
export async function checkRateLimit(name, identifier, { requests = 15, windowSeconds = 60 } = {}) {
  const limiter = getLimiter(name, requests, windowSeconds);
  if (!limiter) {
    // Fail open when not configured.
    return { success: true, remaining: requests, reset: 0, configured: false };
  }
  const result = await limiter.limit(identifier);
  return { ...result, configured: true };
}
