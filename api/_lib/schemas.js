// api/_lib/schemas.js
//
// Shared request-body validation (zod) for the /api endpoints. Centralizing
// these means every endpoint rejects malformed bodies the same way instead
// of each one hand-rolling slightly different checks.

import { z } from "zod";

// --- api/openai-chat.js ---
const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]), // "system" is rejected separately/explicitly
  content: z.string().max(8000, "message too long"),
});

export const openaiChatBodySchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(50, "too many messages in one request"),
  imagesBase64: z.array(z.string().startsWith("data:image/")).max(4, "max 4 images per message").optional(),
  imageBase64: z.string().startsWith("data:image/").optional(), // legacy single-image field
});

// --- api/supabase-upload.js ---
export const uploadBodySchema = z.object({
  imageBase64: z.string().startsWith("data:", "imageBase64 must be a data URL"),
  folder: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,40}$/, "invalid folder name")
    .optional()
    .default("goals"),
});

// Small helper: validates `req.body` against a schema and returns either
// { data } or writes a 400 response and returns { error: true }. Keeps the
// call site in each handler to two lines.
export function validateBody(schema, body, res) {
  const parsed = schema.safeParse(body || {});
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid request body",
      details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
    return { error: true };
  }
  return { data: parsed.data };
}
