// api/openai-chat.js
//
// Server-side proxy to OpenRouter (https://openrouter.ai). The API key lives
// ONLY in Vercel's environment variables (Project Settings -> Environment
// Variables -> OPENROUTER_API_KEY) and is never sent to the browser.
//
// SECURITY: requires a valid Firebase ID token — previously this endpoint
// had no auth check at all, meaning anyone who found the URL could call it
// directly and run up the bill with no login required.
//
// Request body: { messages: [{role, content}], imagesBase64?: ["data:image/...", ...] }
// Header:       Authorization: Bearer <firebaseIdToken>

import { requireAuth } from "./_lib/verifyAuth.js";

// Any OpenRouter model that supports vision (image input) works here.
// See https://openrouter.ai/models for the full list / pricing.
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await requireAuth(req);
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENROUTER_API_KEY not configured on server" });
  }

  // Back-compat: accept the old singular `imageBase64` too, but the client
  // now sends `imagesBase64` (an array) so multiple photos can be attached
  // to one message.
  const { messages = [], imagesBase64, imageBase64 } = req.body || {};
  const images = (Array.isArray(imagesBase64) ? imagesBase64 : imageBase64 ? [imageBase64] : []).filter(Boolean);

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages[] required" });
  }

  // Reject any client-supplied "system" role message — without this, a
  // malicious client could inject a fake system message to try to override
  // the real system prompt below. Only user/assistant turns are legitimate
  // coming from the client.
  const hasClientSystemMsg = messages.some((m) => m.role === "system");
  if (hasClientSystemMsg) {
    return res.status(400).json({ error: "system-role messages are not allowed from the client" });
  }

  // Build the OpenAI-format message list. If image(s) are attached, turn the
  // last user message into a multi-part content array (text + one
  // image_url part per photo).
  //
  // When the user attached photo(s) but typed no question, we deliberately
  // do NOT put words in their mouth (no more auto "What is in this image?
  // Explain it clearly."). Instead we tell the model to look at the
  // photo(s) and ask the user what they'd like help with — mirroring what
  // a human tutor would do if someone silently handed over a page of notes.
  const openaiMessages = messages.map((m, i) => {
    const isLastUser = i === messages.length - 1 && m.role === "user";
    if (isLastUser && images.length > 0) {
      const text = m.content?.trim()
        ? m.content
        : "I attached photo(s) without asking anything yet. Look at what's in the photo(s), then ask me what I'd like help with (e.g. explain it, solve a specific question, summarize it) instead of assuming.";
      return {
        role: "user",
        content: [
          { type: "text", text },
          ...images.map((url) => ({ type: "image_url", image_url: { url } })),
        ],
      };
    }
    return { role: m.role, content: m.content };
  });

  try {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        // OpenRouter asks for these two so it can attribute traffic to your
        // app on https://openrouter.ai/rankings — not strictly required,
        // but good practice and sometimes needed for free-tier rate limits.
        "HTTP-Referer": process.env.PUBLIC_APP_URL || "https://focusly.app",
        "X-Title": "Focusly AI",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are Focusly AI, a friendly study assistant inside a student productivity app. " +
              "When shown a photo of notes, a textbook page, or a whiteboard, read it carefully and " +
              "explain the concepts clearly and simply, like a helpful tutor. Keep answers concise " +
              "and well-structured (use short paragraphs or bullet points).",
          },
          ...openaiMessages,
        ],
        max_tokens: 3000,
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return res.status(resp.status).json({ error: data.error?.message || "OpenRouter error" });
    }

    const reply = data.choices?.[0]?.message?.content || "Sorry, I couldn't generate a reply.";
    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
