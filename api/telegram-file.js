// api/telegram-file.js
//
// Streams back an image that lives on Telegram's file servers, given the
// `path` we stored in Firestore (from telegram-upload.js). The bot token is
// only ever attached to the outgoing server-side request, never sent to
// the browser — so <img src="/api/telegram-file?path=..."/> is safe to use
// directly in the app.

export default async function handler(req, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return res.status(500).send("TELEGRAM_BOT_TOKEN not configured on server");
  }

  const { path } = req.query;
  if (!path) {
    return res.status(400).send("path query param required");
  }

  try {
    const resp = await fetch(`https://api.telegram.org/file/bot${token}/${path}`);
    if (!resp.ok) return res.status(resp.status).send("Failed to fetch file from Telegram");

    const contentType = resp.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await resp.arrayBuffer();

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (err) {
    return res.status(500).send(err.message);
  }
}
