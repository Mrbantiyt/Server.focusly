// api/telegram-upload.js
//
// We don't want to pay for Firebase Storage, so photos (goal-completion
// proof, chat attachments) are sent to a private Telegram chat via bot API
// and we store the resulting file path in Firestore. Token/chat id live only
// in Vercel env vars: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
//
// Request body: { imageBase64: "data:image/jpeg;base64,...", caption?: "" }
// Response: { path: "..." }

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return res.status(500).json({ error: "Telegram env vars not configured on server" });
  }

  const { imageBase64, caption = "" } = req.body || {};
  if (!imageBase64 || !imageBase64.startsWith("data:")) {
    return res.status(400).json({ error: "imageBase64 (data URL) required" });
  }

  try {
    const commaIdx = imageBase64.indexOf(",");
    const meta = imageBase64.slice(5, commaIdx); // e.g. "image/jpeg;base64"
    const mime = meta.split(";")[0] || "image/jpeg";
    const ext = mime.split("/")[1] || "jpg";
    const raw = imageBase64.slice(commaIdx + 1);
    const buffer = Buffer.from(raw, "base64");

    const form = new FormData();
    form.append("chat_id", chatId);
    if (caption) form.append("caption", caption);
    form.append("photo", new Blob([buffer], { type: mime }), `upload.${ext}`);

    const sendResp = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      body: form,
    });
    const sendData = await sendResp.json();
    if (!sendResp.ok || !sendData.ok) {
      return res.status(502).json({ error: sendData.description || "Telegram upload failed" });
    }

    // Grab the largest photo size Telegram generated, then resolve its file path
    const photos = sendData.result.photo || [];
    const best = photos[photos.length - 1];
    const fileResp = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${best.file_id}`);
    const fileData = await fileResp.json();
    if (!fileData.ok) {
      return res.status(502).json({ error: "Could not resolve Telegram file path" });
    }

    // IMPORTANT: we deliberately do NOT return the raw Telegram file URL,
    // because it contains the bot token. We return only `path`, store that
    // in Firestore, and serve the actual image later through
    // telegram-file.js, which keeps the token server-side.
    return res.status(200).json({ path: fileData.result.file_path });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
