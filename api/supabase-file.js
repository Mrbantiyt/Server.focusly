// api/supabase-file.js
//
// Replaces the old telegram-file.js proxy. Because the "Focusly" bucket is
// PUBLIC, files can normally be loaded directly from Supabase's CDN URL
// without going through a Vercel function at all:
//
//   https://<project>.supabase.co/storage/v1/object/public/Focusly/<path>
//
// Use buildPublicUrl() below on the client instead of hitting this
// endpoint for the common case — it's faster (no extra hop) and doesn't
// consume a Vercel invocation.
//
// This endpoint exists only for the one case that matters: confirming the
// requester actually owns the photo before handing back its URL. The old
// telegram-file.js had zero ownership check (any authenticated OR
// unauthenticated caller could fetch any path), which meant any user's
// proof photos were readable by anyone who saw/guessed the path. Since
// paths are namespaced as "<uid>/<folder>/<file>", we can check that here.
//
// Request:  GET /api/supabase-file?path=<uid>/goals/171234-abc.jpg
//           header: Authorization: Bearer <firebaseIdToken>
// Response: { url: "https://.../object/public/Focusly/..." }

import { requireAuth } from "./_lib/verifyAuth.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const BUCKET_NAME = "Focusly";

export function buildPublicUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${path}`;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let decoded;
  try {
    decoded = await requireAuth(req);
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message });
  }

  const { path } = req.query;
  if (!path || typeof path !== "string") {
    return res.status(400).json({ error: "path query param required" });
  }

  // Ownership check: every path we ever create starts with "<uid>/".
  // A user can only ever resolve their own files through this endpoint.
  if (!path.startsWith(`${decoded.uid}/`)) {
    return res.status(403).json({ error: "You do not have access to this file" });
  }

  if (!SUPABASE_URL) {
    return res.status(500).json({ error: "SUPABASE_URL not configured on server" });
  }

  return res.status(200).json({ url: buildPublicUrl(path) });
}
