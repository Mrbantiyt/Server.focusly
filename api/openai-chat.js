// api/openai-chat.js
//
// Server-side proxy to OpenAI. The API key lives ONLY in Vercel's
// environment variables (Project Settings -> Environment Variables ->
// OPENAI_API_KEY) and is never sent to the browser.
//
// SECURITY: requires a valid Firebase ID token — previously this endpoint
// had no auth check at all, meaning anyone who found the URL could call it
// directly and run up the OpenAI bill with no login required.
//
// Request body: { messages: [{role, content}], imageBase64?: "data:image/..."  }
// Header:       Authorization: Bearer <firebaseIdToken>

import { requireAuth } from "./_lib/verifyAuth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await requireAuth(req);
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENAI_API_KEY not configured on server" });
  }

  const { messages = [], imageBase64 } = req.body || {};
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

  // Build the OpenAI-format message list. If an image is attached, turn the
  // last user message into a multi-part content array (text + image_url).
  const openaiMessages = messages.map((m, i) => {
    const isLastUser = i === messages.length - 1 && m.role === "user";
    if (isLastUser && imageBase64) {
      return {
        role: "user",
        content: [
          { type: "text", text: m.content || "What is in this image? Explain it clearly." },
          { type: "image_url", image_url: { url: imageBase64 } },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
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
        max_tokens: 800,
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return res.status(resp.status).json({ error: data.error?.message || "OpenAI error" });
    }

    const reply = data.choices?.[0]?.message?.content || "Sorry, I couldn't generate a reply.";
    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
