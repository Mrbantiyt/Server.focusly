// api/openai-chat.js
//
// Server-side proxy to the BluesMinds relay (api.bluesminds.com — a
// self-hosted "New API" instance that exposes a standard OpenAI-compatible
// /v1/chat/completions endpoint in front of several models). The API key
// lives ONLY in Vercel's environment variables (Project Settings ->
// Environment Variables -> AI_API_KEY) and is never sent to the browser.
//
// SECURITY: requires a valid Firebase ID token, is rate-limited per user,
// and validates the request body shape before doing anything else.
//
// Request body: { messages: [{role, content}], imagesBase64?: ["data:image/...", ...] }
// Header:       Authorization: Bearer <firebaseIdToken>

import { requireAuth } from "./_lib/verifyAuth.js";
import { checkRateLimit } from "./_lib/rateLimit.js";
import { openaiChatBodySchema, validateBody } from "./_lib/schemas.js";
import { withSentry } from "./_lib/sentry.js";

// Primary provider.
let AI_API_URL = process.env.AI_API_BASE_URL || "https://api.bluesminds.com/v1/chat/completions";
let AI_MODEL = process.env.AI_MODEL || "gpt-5.5";
const AI_API_KEY = process.env.AI_API_KEY;

// Gemini's *native* REST API (generativelanguage.googleapis.com/v1beta/models/...
// :generateContent) does NOT understand "Authorization: Bearer <key>" — it
// needs the key as a "key=" query param or an "x-goog-api-key" header, and a
// totally different request/response shape ({ contents: [...] } instead of
// { messages: [...] }). This proxy always sends OpenAI-shaped requests, so
// if AI_API_BASE_URL is ever set to that native URL by mistake, every call
// fails with a confusing "expected OAuth 2 access token" error even though
// the key itself is fine.
//
// Google *also* publishes an OpenAI-compatible endpoint that accepts
// exactly the request shape this proxy sends
// (https://ai.google.dev/gemini-api/docs/openai). So if we detect the
// native-style URL, auto-correct to the compatible one instead of failing.
const GEMINI_ALIAS_MAP = { "gemini-flash-latest": "gemini-2.5-flash", "gemini-pro-latest": "gemini-2.5-pro" };

if (AI_API_URL.includes("generativelanguage.googleapis.com") && !AI_API_URL.includes("/openai/")) {
  const nativeModelMatch = AI_API_URL.match(/\/models\/([^/:]+):/);
  if (nativeModelMatch && (!process.env.AI_MODEL || process.env.AI_MODEL === "gpt-5.5")) {
    AI_MODEL = GEMINI_ALIAS_MAP[nativeModelMatch[1]] || nativeModelMatch[1];
  }
  AI_API_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
}

// Also normalize a "-latest" alias if it was set directly via AI_MODEL while
// already pointed at Gemini's OpenAI-compatible endpoint.
if (AI_API_URL.includes("generativelanguage.googleapis.com/v1beta/openai") && GEMINI_ALIAS_MAP[AI_MODEL]) {
  AI_MODEL = GEMINI_ALIAS_MAP[AI_MODEL];
}

const SYSTEM_PROMPT =
  "You are Focusly AI, a friendly study assistant inside a student productivity app. " +
  "When shown a photo of notes, a textbook page, or a whiteboard, read it carefully and " +
  "explain the concepts clearly and simply, like a helpful tutor. Keep answers concise " +
  "and well-structured (use short paragraphs or bullet points).";

function buildOpenaiMessages(messages, images) {
  return messages.map((m, i) => {
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
}

async function callProvider(url, apiKey, model, openaiMessages) {
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...openaiMessages],
      max_tokens: 2000,
    }),
  });
  const data = await resp.json();
  return { ok: resp.ok, status: resp.status, data };
}

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let decoded;
  try {
    decoded = await requireAuth(req);
  } catch (err) {
    return res.status(err.statusCode || 401).json({ error: err.message });
  }

  // Rate limit AFTER auth so we key on a real, verified uid (can't be spoofed).
  const rl = await checkRateLimit("openai-chat", decoded.uid, { requests: 50, windowSeconds: 60 });
  if (!rl.success) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "Too many requests — please slow down and try again shortly." });
  }

  const { data: body, error: badBody } = validateBody(openaiChatBodySchema, req.body, res);
  if (badBody) return; // validateBody already sent the 400 response

  const { messages, imagesBase64, imageBase64 } = body;
  const images = (Array.isArray(imagesBase64) ? imagesBase64 : imageBase64 ? [imageBase64] : []).filter(Boolean);

  // Reject any client-supplied "system" role message — without this, a
  // malicious client could inject a fake system message to try to override
  // the real system prompt above.
  const hasClientSystemMsg = messages.some((m) => m.role === "system");
  if (hasClientSystemMsg) {
    return res.status(400).json({ error: "system-role messages are not allowed from the client" });
  }

  if (!AI_API_KEY) {
    return res.status(500).json({ error: "AI_API_KEY not configured on server" });
  }

  const openaiMessages = buildOpenaiMessages(messages, images);

  try {
    const result = await callProvider(AI_API_URL, AI_API_KEY, AI_MODEL, openaiMessages);

    if (!result.ok) {
      return res.status(result.status).json({ error: result.data.error?.message || "AI provider error" });
    }

    const reply = result.data.choices?.[0]?.message?.content || "Sorry, I couldn't generate a reply.";
    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export default withSentry(handler);
