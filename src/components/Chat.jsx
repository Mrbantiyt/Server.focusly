// src/components/Chat.jsx
// In-app "Focusly AI" chat. Talks to our own serverless proxy
// (api/openai-chat.js), which forwards to OpenRouter — the API key
// stays server-side, never in this file or the browser.
//
// Supports:
//  - plain text questions
//  - attaching a photo (notes, textbook page, whiteboard) which gets
//    compressed client-side, sent to the vision-capable model, and the
//    user can ask a question about it ("explain this", "what's the
//    answer to Q3", etc).
import React, { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Image as ImageIcon, X, Loader2 } from "lucide-react";
import { COL, neu } from "../theme";
import { askFocuslyAI, fileToDataURL, compressImage } from "../lib/ai";

export default function Chat() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hey! I'm Focusly AI. Ask me anything, or attach a photo of your notes and I'll help explain it." },
  ]);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState(null); // { dataUrl, previewUrl }
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const handlePickImage = () => fileInputRef.current?.click();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again later
    if (!file) return;
    setError("");
    try {
      // Compressed copy is what actually gets sent to the model/stored.
      const compressedDataUrl = await compressImage(file, { maxDim: 1280, quality: 0.75, maxBytes: 350 * 1024 });
      setPendingImage({ dataUrl: compressedDataUrl });
    } catch (err) {
      console.error(err);
      setError("Couldn't read that image — try a different photo.");
    }
  };

  const clearPendingImage = () => setPendingImage(null);

  const handleSend = async () => {
    const text = input.trim();
    if (!text && !pendingImage) return;
    if (sending) return;

    setError("");
    const userMsg = {
      role: "user",
      content: text || (pendingImage ? "What is in this image? Explain it clearly." : ""),
      imagePreview: pendingImage?.dataUrl || null,
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    const imageForRequest = pendingImage?.dataUrl || null;
    setPendingImage(null);
    setSending(true);

    try {
      // Only send role/content to the backend (imagePreview is UI-only).
      const apiMessages = nextMessages.map((m) => ({ role: m.role, content: m.content }));
      const reply = await askFocuslyAI(apiMessages, imageForRequest);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      console.error(err);
      setError(err.message || "Something went wrong talking to Focusly AI.");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full px-2">
      <div className="flex items-center gap-2 py-2">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(123,110,246,0.15)" }}>
          <Sparkles size={16} color={COL.violet} />
        </div>
        <div className="font-display font-semibold text-base" style={{ color: COL.ink }}>Ask AI</div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto flex flex-col gap-3 py-2 pr-1">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              style={{
                ...neu(m.role === "user", 16),
                maxWidth: "82%",
                background: m.role === "user" ? "rgba(123,110,246,0.18)" : COL.card,
              }}
              className="px-3 py-2"
            >
              {m.imagePreview && (
                <img
                  src={m.imagePreview}
                  alt="attachment"
                  className="rounded-lg mb-2 max-h-48 object-cover"
                  style={{ border: `1px solid ${COL.border}` }}
                />
              )}
              {m.content && (
                <div className="font-body text-sm whitespace-pre-wrap" style={{ color: COL.ink }}>
                  {m.content}
                </div>
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div style={neu(false, 16)} className="px-3 py-2 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" color={COL.sub} />
              <span className="font-body text-xs" style={{ color: COL.sub }}>Thinking…</span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="font-body text-xs px-1 pb-1" style={{ color: COL.coral }}>
          {error}
        </div>
      )}

      {pendingImage && (
        <div className="flex items-center gap-2 px-1 pb-2">
          <div className="relative">
            <img
              src={pendingImage.dataUrl}
              alt="selected"
              className="w-14 h-14 rounded-lg object-cover"
              style={{ border: `1px solid ${COL.border}` }}
            />
            <button
              onClick={clearPendingImage}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: COL.coral }}
              aria-label="Remove image"
            >
              <X size={12} color="#fff" />
            </button>
          </div>
          <div className="font-body text-xs" style={{ color: COL.sub }}>
            Photo attached — add a question or just send.
          </div>
        </div>
      )}

      <div className="flex items-end gap-2 py-2">
        <button
          onClick={handlePickImage}
          disabled={sending}
          style={neu(false, 14)}
          className="w-11 h-11 flex items-center justify-center flex-shrink-0 active:scale-[0.95] transition disabled:opacity-50"
          aria-label="Attach photo"
        >
          <ImageIcon size={18} color={COL.violet} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question…"
          rows={1}
          style={{ ...neu(true, 14), color: COL.ink, resize: "none" }}
          className="flex-1 font-body text-sm px-3 py-3 outline-none min-h-[44px] max-h-28"
        />

        <button
          onClick={handleSend}
          disabled={sending || (!input.trim() && !pendingImage)}
          style={neu(false, 14)}
          className="w-11 h-11 flex items-center justify-center flex-shrink-0 active:scale-[0.95] transition disabled:opacity-40"
          aria-label="Send"
        >
          <Send size={18} color={COL.violet} />
        </button>
      </div>
    </div>
  );
}
