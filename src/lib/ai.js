// src/lib/ai.js
// Talks to our own Vercel serverless function, never to OpenAI directly —
// the key stays server-side (see api/openai-chat.js).

export async function askFocuslyAI(messages, imageBase64 = null) {
  const resp = await fetch("/api/openai-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, imageBase64 }),
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
// anywhere. Phone-camera photos are often 3000-4000px and several MB —
// none of that extra resolution helps Telegram or the vision model, it
// just makes the base64 payload huge and the request slow. Capping the
// longest side at `maxDim` and using JPEG quality `quality` typically
// takes a multi-MB photo down to a couple hundred KB.
export function compressImage(file, { maxDim = 1280, quality = 0.75 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
