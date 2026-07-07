// src/lib/media.js
// Uploads a photo to our Telegram-backed "storage" via a Vercel serverless
// function, and returns { path } to save in Firestore. Use telegramSrc(path)
// to build an <img src> that proxies through our own function (token stays
// hidden).

import { fileToDataURL, compressImage } from "./ai";

// Photos straight off a phone camera are commonly 3-12MB. Base64-encoding
// that (which adds ~33% overhead) and pushing it through our serverless
// function + Telegram is what made uploads feel slow. Downscaling to a
// sane max dimension and re-encoding as JPEG before it ever leaves the
// device cuts the payload to a few hundred KB, so the upload finishes in
// a second or two instead of many seconds.
export async function uploadProofPhoto(file, caption = "") {
  const imageBase64 = await compressImage(file, { maxDim: 1280, quality: 0.72 });
  const resp = await fetch("/api/telegram-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, caption }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || "Upload failed");
  return data.path; // save this string in Firestore
}

export function telegramSrc(path) {
  if (!path) return null;
  return `/api/telegram-file?path=${encodeURIComponent(path)}`;
}

// Custom profile picture (DP). Same Telegram-backed pipeline as proof
// photos, just a smaller target size since it only ever renders as a
// small round/rounded avatar.
export async function uploadProfilePhoto(file) {
  const imageBase64 = await compressImage(file, { maxDim: 512, quality: 0.8 });
  const resp = await fetch("/api/telegram-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, caption: "Profile picture" }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || "Upload failed");
  return telegramSrc(data.path); // ready to store as photoURL directly
}
