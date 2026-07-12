// api/_lib/supabaseAdmin.js
//
// Server-side Supabase client using the SECRET key (full read/write access,
// bypasses bucket policies). This must never be sent to the browser — it
// only ever runs inside Vercel functions, same rule as the Telegram bot
// token before it.
//
// Required environment variables (set in Vercel Project Settings):
//   SUPABASE_URL         - e.g. https://xxxxxxxxxxxxx.supabase.co
//   SUPABASE_SECRET_KEY  - the "Secret key" from Project Settings > API Keys

import { createClient } from "@supabase/supabase-js";

let client = null;

export function getSupabaseAdmin() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SECRET_KEY not configured on server");
  }

  client = createClient(url, key, {
    auth: { persistSession: false },
  });
  return client;
}

export const BUCKET_NAME = "Focusly";
