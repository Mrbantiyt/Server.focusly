// src/lib/media.js
// Uploads a photo to our Telegram-backed "storage" via a Vercel serverless
// function, and returns { path } to save in Firestore. Use telegramSrc(path)
// to build an <img src> that proxies through our own function (token stays
// hidden).

import { fileToDataURL } from "./ai";

export async function uploadProofPhoto(file, caption = "") {
  const imageBase64 = await fileToDataURL(file);
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
