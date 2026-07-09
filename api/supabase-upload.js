// api/supabase-upload.js
//
// Replaces the old Telegram-based telegram-upload.js. Photos (goal-completion
// proof, chat attachments) are uploaded to a Supabase Storage bucket instead
// of a Telegram bot chat — this removes the single-bot-token, single-chat
// point of failure the Telegram approach had, and gives each file a stable,
// namespaced path we control.
//
// SECURITY: this endpoint now requires a valid Firebase ID token (the old
// telegram-upload.js had no auth check at all, meaning anyone with the URL
// could spend/abuse it). The uploader's uid is baked into the storage path
// so users can only ever write into their own folder.
//
// Request:  POST, header "Authorization: Bearer <firebaseIdToken>"
//           body: { imageBase64: "data:image/jpeg;base64,...", folder?: "goals" }
// Response: { path: "uid/goals/171234-abc.jpg" }

import { requireAuth } from "./_lib/verifyAuth.js";
import { getSupabaseAdmin, BUCKET_NAME } from "./_lib/supabaseAdmin.js";

// Hard cap so a single upload can't be used to burn storage/bandwidth.
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

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

  const { imageBase64, folder = "goals" } = req.body || {};
  if (!imageBase64 || !imageBase64.startsWith("data:")) {
    return res.status(400).json({ error: "imageBase64 (data URL) required" });
  }
  // Only allow simple, predictable folder names — prevents someone from
  // passing "../../etc" or similar and writing outside their own prefix.
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(folder)) {
    return res.status(400).json({ error: "invalid folder name" });
  }

  try {
    const commaIdx = imageBase64.indexOf(",");
    const meta = imageBase64.slice(5, commaIdx); // e.g. "image/jpeg;base64"
    const mime = meta.split(";")[0] || "image/jpeg";
    const ext = (mime.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "");
    const raw = imageBase64.slice(commaIdx + 1);
    const buffer = Buffer.from(raw, "base64");

    if (buffer.length > MAX_BYTES) {
      return res.status(413).json({ error: "Image too large (max 5MB)" });
    }
    if (!mime.startsWith("image/")) {
      return res.status(400).json({ error: "Only image uploads are allowed" });
    }

    // Path is namespaced by uid so a user can never overwrite another
    // user's file even if they guessed its name.
    const path = `${decoded.uid}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const supabase = getSupabaseAdmin();
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(path, buffer, { contentType: mime, upsert: false });

    if (uploadError) {
      return res.status(502).json({ error: uploadError.message });
    }

    return res.status(200).json({ path });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
