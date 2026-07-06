// src/components/Chat.jsx
// Real replies now — goes through /api/openai-chat so the
// OpenAI key stays server-side (see src/lib/ai.js).
import React, { useEffect, useRef, useState } from "react";
import { Send, Image as ImageIcon, Loader2 } from "lucide-react";
import { COL, neu } from "../theme";
import { askFocuslyAI, fileToDataURL } from "../lib/ai";

export default function Chat() {
  const [msgs, setMsgs] = useState([
    { id: 1, from: "ai", text: "Hi! Upload a photo of your notes or ask me anything." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const fileRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  // Builds the plain-text history OpenAI expects (drops image previews)
  const historyFor = (extraUserText) => [
    ...msgs.filter((m) => m.text).map((m) => ({ role: m.from === "user" ? "user" : "assistant", content: m.text })),
    { role: "user", content: extraUserText },
  ];

  const send = async (text) => {
    if (!text.trim() || busy) return;
    setMsgs((m) => [...m, { id: Date.now(), from: "user", text }]);
    setInput("");
    setBusy(true);
    try {
      const reply = await askFocuslyAI(historyFor(text));
      setMsgs((m) => [...m, { id: Date.now() + 1, from: "ai", text: reply }]);
    } catch (e) {
      setMsgs((m) => [...m, { id: Date.now() + 1, from: "ai", text: "Sorry, something went wrong: " + e.message }]);
    } finally {
      setBusy(false);
    }
  };

  const attachPhoto = async (file) => {
    if (!file || busy) return;
    const dataUrl = await fileToDataURL(file);
    setMsgs((m) => [...m, { id: Date.now(), from: "user", text: "🖼️ photo of notes", image: dataUrl }]);
    setBusy(true);
    try {
      const reply = await askFocuslyAI(
        historyFor("Here is a photo of my notes — please read it and explain the key concepts."),
        dataUrl
      );
      setMsgs((m) => [...m, { id: Date.now() + 1, from: "ai", text: reply }]);
    } catch (e) {
      setMsgs((m) => [...m, { id: Date.now() + 1, from: "ai", text: "Sorry, I couldn't read that photo: " + e.message }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto flex flex-col gap-3 pb-3">
        {msgs.map((m) => (
          <div key={m.id} className={`max-w-[80%] px-4 py-2.5 font-body text-sm whitespace-pre-wrap ${m.from === "user" ? "self-end" : "self-start"}`}
            style={{ borderRadius: 16, background: m.from === "user" ? `linear-gradient(135deg, ${COL.violet}, ${COL.violetDeep})` : COL.card,
              color: m.from === "user" ? "#fff" : COL.ink, boxShadow: m.from === "user" ? "none" : "4px 4px 10px rgba(163,170,199,0.3)" }}>
            {m.image && <img src={m.image} alt="upload" className="rounded-xl mb-2 max-h-40 object-cover" />}
            {m.text}
          </div>
        ))}
        {busy && (
          <div className="self-start flex items-center gap-2 px-4 py-2.5" style={{ borderRadius: 16, background: COL.card }}>
            <Loader2 size={14} color={COL.sub} className="animate-spin" />
            <span className="font-body text-xs" style={{ color: COL.sub }}>thinking…</span>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div style={neu(false, 22)} className="p-2 flex items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => attachPhoto(e.target.files?.[0])} />
        <button onClick={() => fileRef.current?.click()} disabled={busy}
          className="w-9 h-9 flex items-center justify-center rounded-full active:scale-95"><ImageIcon size={16} color={COL.sub} /></button>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="Ask about your notes…" className="flex-1 bg-transparent outline-none font-body text-sm px-1" style={{ color: COL.ink }} disabled={busy} />
        <button onClick={() => send(input)} disabled={busy} className="w-9 h-9 flex items-center justify-center rounded-full" style={{ background: COL.violet }}>
          <Send size={14} color="#fff" />
        </button>
      </div>
    </div>
  );
}
