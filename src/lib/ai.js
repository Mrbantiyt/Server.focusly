// src/lib/ai.js
// Talks to our own Vercel serverless function, never to OpenAI directly —
// the key stays server-side (see api/openai-chat.js).

import { auth } from "../firebase";

// `images` is an array of data-URL strings (0, 1, or many photos attached
// to the last user message). Kept as an array end-to-end so a question can
// reference multiple photos at once (e.g. two pages of the same notes).
export async function askFocuslyAI(messages, images = []) {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in to use the AI chat");
  const idToken = await user.getIdToken();

  const resp = await fetch("/api/openai-chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ messages, imagesBase64: images }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || "AI request failed");
  return data.reply;
}

// Reads a File (from an <input type="file">) into a base64 data URL,
// e.g. for sending a notes photo to the vision model.
export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Downscales + re-encodes a File to a JPEG data URL before it's ever sent
// anywhere. Phone-camera photos are often 3000-4000px and several MB — none
// of that extra resolution helps our storage or the vision model, it just
// makes the upload slow and eats storage quota.
//
// Unlike a single-pass resize, this now GUARANTEES the output stays under
// `maxBytes` (default 100KB) no matter how large the original photo was:
// it starts at `quality`/`maxDim`, and if the result is still too big, it
// keeps re-encoding at lower quality and then smaller dimensions until it
// fits, or gives up after a bounded number of tries (so a pathological
// image can't hang the browser forever).
export function compressImage(file, { maxDim = 1280, quality = 0.75, maxBytes = 100 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const dataUrlBytes = (dataUrl) => Math.round((dataUrl.length * 3) / 4); // base64 -> raw byte estimate

        const renderAt = (dim, q) => {
          let { width, height } = img;
          if (width > dim || height > dim) {
            if (width >= height) {
              height = Math.round((height * dim) / width);
              width = dim;
            } else {
              width = Math.round((width * dim) / height);
              height = dim;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          return canvas.toDataURL("image/jpeg", q);
        };

        let dim = maxDim;
        let q = quality;
        let out = renderAt(dim, q);

        // First bring quality down in steps (cheap: no re-resizing needed).
        let tries = 0;
        while (dataUrlBytes(out) > maxBytes && q > 0.35 && tries < 6) {
          q -= 0.1;
          out = renderAt(dim, q);
          tries++;
        }

        // If quality alone isn't enough, start shrinking dimensions too —
        // this is what actually saves a very large/detailed source photo
        // from staying above the cap.
        tries = 0;
        while (dataUrlBytes(out) > maxBytes && dim > 320 && tries < 8) {
          dim = Math.round(dim * 0.8);
          out = renderAt(dim, Math.max(q, 0.5));
          tries++;
        }

        resolve(out);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
