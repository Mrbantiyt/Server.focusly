// api/supabase-delete.js
//
// Deletes one or more files from the Supabase Storage bucket. Used whenever
// a task/goal (and therefore its proof photo) is removed — either by the
// user manually deleting a task, or by the automatic midnight task reset —
// so photos don't pile up in storage forever as orphaned files nobody can
// ever reach again through the app.
//
// This has to be a server endpoint rather than a direct client-side
// Supabase call because deleting requires the SECRET key (the publishable
// key alone can't delete from a bucket with default policies), and the
// secret key must never reach the browser.
//
// SECURITY: requires a valid Firebase ID token, and every path must be
// prefixed with the caller's own uid (paths are always created as
// "<uid>/<folder>/<file>" by supabase-upload.js) — so a user can only ever
// delete their own files, never someone else's, even if they guessed a path.
//
// Request:  POST, header "Authorization: Bearer <firebaseIdToken>"
//           body: { paths: ["uid/goals/171234-abc.jpg", ...] }
// Response: { deleted: number }

import { requireAuth } from "./_lib/verifyAuth.js";
import { getSupabaseAdmin, BUCKET_NAME } from "./_lib/supabaseAdmin.js";

// Hard cap so one call can't be used to trigger an unbounded bulk delete.
const MAX_PATHS_PER_CALL = 200;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let decoded;
  try {
    decoded = await requireAuth(req);
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message });
  }

  const { paths } = req.body || {};
  if (!Array.isArray(paths) || paths.length === 0) {
    return res.status(400).json({ error: "paths (non-empty array) required" });
  }
  if (paths.length > MAX_PATHS_PER_CALL) {
    return res.status(400).json({ error: `too many paths (max ${MAX_PATHS_PER_CALL} per call)` });
  }

  // Ownership check: every path we ever create starts with "<uid>/". Silently
  // drop (don't error on) any path that doesn't belong to this user, rather
  // than letting one bad path block deletion of the caller's legitimate ones.
  const ownPaths = paths.filter((p) => typeof p === "string" && p.startsWith(`${decoded.uid}/`));
  if (ownPaths.length === 0) {
    return res.status(200).json({ deleted: 0 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage.from(BUCKET_NAME).remove(ownPaths);
    if (error) {
      return res.status(502).json({ error: error.message });
    }
    return res.status(200).json({ deleted: data?.length || 0 });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
