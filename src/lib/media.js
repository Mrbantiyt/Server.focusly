// src/lib/media.js
// Uploads a photo to Supabase Storage via a Vercel serverless function, and
// returns { path } to save in Firestore. Use mediaSrc(path) to build a
// ready-to-use <img src> URL (the bucket is public, so this is a direct
// CDN URL — no per-request server hop needed).

import { fileToDataURL, compressImage } from "./ai";
import { auth } from "../firebase";

// Every call to our own api/ functions must prove who's calling — the
// endpoints reject requests without a valid Firebase ID token. This grabs
// a fresh token for the currently signed-in user.
async function authHeader() {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in to upload photos");
  const idToken = await user.getIdToken();
  return { Authorization: `Bearer ${idToken}` };
}

// Photos straight off a phone camera are commonly 3-12MB. Base64-encoding
// that (which adds ~33% overhead) and pushing it through our serverless
// function is what made uploads feel slow. Downscaling to a sane max
// dimension and re-encoding as JPEG before it ever leaves the device cuts
// the payload to a few hundred KB, so the upload finishes in a second or
// two instead of many seconds.
export async function uploadProofPhoto(file) {
  const imageBase64 = await compressImage(file, { maxDim: 1280, quality: 0.72, maxBytes: 100 * 1024 });
  const resp = await fetch("/api/supabase-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ imageBase64, folder: "goals" }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || "Upload failed");
  return data.path; // save this string in Firestore
}

// Bucket is public, so this is a direct, stable CDN URL — no auth needed
// to *view* it, only to upload/resolve it originally.
export function mediaSrc(path) {
  if (!path) return null;
  const base = import.meta.env.VITE_SUPABASE_URL;
  return `${base}/storage/v1/object/public/Focusly/${path}`;
}

// Deletes one or more uploaded files (e.g. goal proof photos) from Supabase
// Storage. Call this whenever the Firestore doc referencing them is being
// removed (task deletion, midnight auto-reset) so the actual image doesn't
// stay behind forever as an orphaned file nobody can reach anymore.
// Silently no-ops on an empty/missing list, and swallows errors (this is
// always called as a best-effort cleanup alongside a Firestore write that
// has already succeeded — a failed cleanup here shouldn't block or roll
// back the task deletion itself).
export async function deleteMediaFiles(paths) {
  const list = (paths || []).filter(Boolean);
  if (list.length === 0) return;
  try {
    await fetch("/api/supabase-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ paths: list }),
    });
  } catch {
    // best-effort — a stray orphaned file is a minor storage cost, not
    // worth surfacing an error to the user over.
  }
}

// NOTE: there is deliberately no uploadProfilePhoto() anymore. Profile
// pictures (DP) are now chosen only from the user's unlocked mascot
// collection (see AccountSettingsPanel in Settings.jsx) instead of an
// arbitrary gallery photo — this keeps every DP a known, pre-approved
// image instead of user-uploaded content.
