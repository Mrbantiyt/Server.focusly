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
