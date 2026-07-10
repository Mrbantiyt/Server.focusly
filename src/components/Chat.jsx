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
import { Sparkles, Send, Image as ImageIcon, X, Trash2, NotebookPen, Check } from "lucide-react";
import { COL, neu } from "../theme";
import { askFocuslyAI, fileToDataURL, compressImage } from "../lib/ai";
import { getAiChat, saveAiChat, clearAiChat, addNote, updateNote } from "../lib/firestore";
import { useNotes } from "../hooks/useNotes";
import { ChatSkeleton } from "./Skeleton";

// Max photos attachable to a single message — keeps payload size and the
// vision request sane while still covering "several pages of the same
// notes" (matches what a phone's photo picker comfortably hands over).
const MAX_IMAGES = 6;

// If a single assistant reply is long, it reads better as a couple of
// separate chat bubbles (like a person typing multiple messages) instead
// of one wall of text. This splits on paragraph breaks first, and only
// hard-splits mid-paragraph if a single paragraph is itself huge.
function splitReplyIntoChunks(text, maxLen = 700) {
  const trimmed = (text || "").trim();
  if (!trimmed) return [trimmed];
  if (trimmed.length <= maxLen) return [trimmed];

  const paragraphs = trimmed.split(/\n{2,}/);
  const chunks = [];
  let current = "";
  for (const para of paragraphs) {
    if (!current) {
      current = para;
    } else if ((current + "\n\n" + para).length <= maxLen) {
      current += "\n\n" + para;
    } else {
      chunks.push(current);
      current = para;
    }
  }
  if (current) chunks.push(current);

  // A single paragraph longer than maxLen*1.5 won't have been split above —
  // fall back to a hard split so we never emit one giant bubble.
  const final = [];
  for (const chunk of chunks) {
    if (chunk.length <= maxLen * 1.5) {
      final.push(chunk);
    } else {
      for (let i = 0; i < chunk.length; i += maxLen) {
        final.push(chunk.slice(i, i + maxLen));
      }
    }
  }
  return final.length ? final : [trimmed];
}

const WELCOME_MSG = { role: "assistant", content: "Hey! I'm Focusly AI. Ask me anything, or attach a photo of your notes and I'll help explain it." };

export default function Chat({ user }) {
  const [messages, setMessages] = useState([WELCOME_MSG]);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState([]); // [{ dataUrl }]
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // "Add to notes": tap the button, tap one or more messages to select them
  // (multi-select), then tap "Save" — this opens a small chooser asking
  // whether to file the selected message(s) into a brand-new note or
  // append them to an existing one.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [savingNote, setSavingNote] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [pendingNote, setPendingNote] = useState(null); // { heading, noteText }
  const [noteTargetStep, setNoteTargetStep] = useState(null); // null | "choose" | "pickExisting"
  const { notes: existingNotes } = useNotes(user?.uid);
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);

  // Load any saved conversation once, when we know who the user is.
  useEffect(() => {
    if (!user?.uid) { setLoaded(true); return; }
    let cancelled = false;
    (async () => {
      try {
        const saved = await getAiChat(user.uid);
        if (!cancelled && saved && saved.length > 0) setMessages(saved);
      } catch (err) {
        console.error("Failed to load saved chat:", err);
        // Loading failed (network/permissions/etc). Do NOT mark as loaded —
        // that would let the save-effect below fire with just the welcome
        // message and overwrite whatever is actually stored in Firestore.
        if (!cancelled) setLoadFailed(true);
        return;
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.uid]);

  // Persist on every change, once the initial load has finished (so we
  // never overwrite a saved chat with the placeholder welcome message).
  useEffect(() => {
    if (!user?.uid || !loaded || loadFailed) return;
    saveAiChat(user.uid, messages).catch((err) => console.error("Failed to save chat:", err));
  }, [messages, loaded, loadFailed, user?.uid]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const handleClearChat = async () => {
    setDeleting(true);
    setMessages([WELCOME_MSG]);
    if (user?.uid) {
      try { await clearAiChat(user.uid); } catch (err) { console.error("Failed to clear chat:", err); }
    }
    setDeleting(false);
    setShowDeleteModal(false);
  };

  const enterSelectMode = () => {
    setSelectMode(true);
    setSelectedIds(new Set());
  };

  const cancelSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelected = (idx) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // Step 1: build the note text from the selected message(s) and open the
  // "New note / Add to existing note" chooser instead of saving right away.
  const saveSelectedToNotes = () => {
    if (!user?.uid || selectedIds.size === 0 || savingNote) return;

    const selected = messages
      .map((m, i) => ({ ...m, _i: i }))
      .filter((m) => selectedIds.has(m._i));

    // Auto-generate a heading from the first selected message so the note
    // shows up in the Notes list with something recognizable, instead of
    // just "Empty note".
    const titleSource = (selected.find((m) => m.content?.trim())?.content || "Ask AI").trim();
    const heading = titleSource.length > 60 ? titleSource.slice(0, 60).trimEnd() + "…" : titleSource;

    const body = selected
      .map((m) => `${m.role === "user" ? "You" : "Focusly AI"}: ${m.content || "(photo)"}`)
      .join("\n\n");

    setPendingNote({ heading, noteText: `${heading}\n\n${body}` });
    setNoteTargetStep("choose");
  };

  const closeNoteTargetModal = () => {
    setNoteTargetStep(null);
    setPendingNote(null);
  };

  const finishSavingNote = () => {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2200);
    closeNoteTargetModal();
    cancelSelectMode();
  };

  // Step 2a: file the selected message(s) into a brand-new note.
  const confirmSaveAsNewNote = async () => {
    if (!user?.uid || !pendingNote || savingNote) return;
    setSavingNote(true);
    try {
      await addNote(user.uid, pendingNote.noteText, pendingNote.heading);
      finishSavingNote();
    } catch (err) {
      console.error("Failed to save to notes:", err);
      setError("Couldn't save to Notes — try again.");
    } finally {
      setSavingNote(false);
    }
  };

  // Step 2b: append the selected message(s) onto the end of an existing note.
  const confirmAppendToNote = async (note) => {
    if (!user?.uid || !pendingNote || savingNote) return;
    setSavingNote(true);
    try {
      const merged = [note.text, pendingNote.noteText].filter(Boolean).join("\n\n");
      await updateNote(user.uid, note.id, { text: merged });
      finishSavingNote();
    } catch (err) {
      console.error("Failed to save to notes:", err);
      setError("Couldn't save to Notes — try again.");
    } finally {
      setSavingNote(false);
    }
  };

  const handlePickImage = () => fileInputRef.current?.click();

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // allow picking the same file(s) again later
    if (files.length === 0) return;
    setError("");

    const room = MAX_IMAGES - pendingImages.length;
    if (room <= 0) {
      setError(`You can attach up to ${MAX_IMAGES} photos at once.`);
      return;
    }
    const toProcess = files.slice(0, room);
    if (files.length > toProcess.length) {
      setError(`You can attach up to ${MAX_IMAGES} photos at once — added the first ${toProcess.length}.`);
    }

    try {
      // Compressed copies are what actually get sent to the model/stored.
      const compressed = await Promise.all(
        toProcess.map((file) => compressImage(file, { maxDim: 1280, quality: 0.75, maxBytes: 350 * 1024 }))
      );
      setPendingImages((prev) => [...prev, ...compressed.map((dataUrl) => ({ dataUrl }))]);
    } catch (err) {
      console.error(err);
      setError("Couldn't read that image — try a different photo.");
    }
  };

  const removePendingImage = (idx) => setPendingImages((prev) => prev.filter((_, i) => i !== idx));

  const handleSend = async () => {
    const text = input.trim();
    if (!text && pendingImages.length === 0) return;
    if (sending) return;

    setError("");
    const userMsg = {
      role: "user",
      // No more auto-filled "What is in this image? Explain it clearly." —
      // if the user didn't type anything, the message just carries the
      // photo(s) and the AI is the one that asks what to do with them.
      content: text,
      imagePreviews: pendingImages.map((img) => img.dataUrl),
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    const imagesForRequest = pendingImages.map((img) => img.dataUrl);
    setPendingImages([]);
    setSending(true);

    try {
      // Only send role/content to the backend (imagePreviews is UI-only).
      const apiMessages = nextMessages.map((m) => ({ role: m.role, content: m.content }));
      const reply = await askFocuslyAI(apiMessages, imagesForRequest);
      // Long answers read better as a few short messages than one wall of
      // text — split on paragraph breaks so it feels like natural typing.
      const chunks = splitReplyIntoChunks(reply);
      setMessages((prev) => [...prev, ...chunks.map((content) => ({ role: "assistant", content }))]);
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
        {!selectMode ? (
          <>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(123,110,246,0.15)" }}>
              <Sparkles size={16} color={COL.violet} />
            </div>
            <div className="font-display font-semibold text-base flex-1" style={{ color: COL.ink }}>Ask AI</div>

            {messages.length > 1 && (
              <button
                onClick={enterSelectMode}
                style={neu(false, 12)}
                className="flex items-center gap-1.5 px-2.5 h-8 flex-shrink-0 active:scale-[0.95] transition"
                aria-label="Add to notes"
              >
                <NotebookPen size={14} color={COL.violet} />
                <span className="font-body text-xs font-semibold" style={{ color: COL.violet }}>
                  Add to notes
                </span>
              </button>
            )}

            {messages.length > 1 && (
              <button
                onClick={() => setShowDeleteModal(true)}
                style={neu(false, 12)}
                className="flex items-center gap-1.5 px-2.5 h-8 flex-shrink-0 active:scale-[0.95] transition"
                aria-label="Delete all chats"
              >
                <Trash2 size={14} color={COL.sub} />
                <span className="font-body text-xs font-semibold" style={{ color: COL.sub }}>
                  Delete all
                </span>
              </button>
            )}
          </>
        ) : (
          <>
            <button
              onClick={cancelSelectMode}
              className="font-body text-xs font-semibold px-1 flex-shrink-0"
              style={{ color: COL.sub }}
            >
              Cancel
            </button>
            <div className="font-body text-xs flex-1 text-center" style={{ color: COL.sub }}>
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Tap message(s) to select"}
            </div>
            <button
              onClick={saveSelectedToNotes}
              disabled={selectedIds.size === 0 || savingNote}
              style={{
                borderRadius: 12,
                background: selectedIds.size === 0 ? COL.track : "linear-gradient(180deg, #5AA7FF 0%, #3D8CEF 100%)",
              }}
              className="flex items-center gap-1.5 px-3 h-8 flex-shrink-0 active:scale-[0.95] transition disabled:opacity-60"
            >
              <NotebookPen size={13} color={selectedIds.size === 0 ? COL.sub : "#fff"} />
              <span className="font-body text-xs font-semibold" style={{ color: selectedIds.size === 0 ? COL.sub : "#fff" }}>
                {savingNote ? "Saving…" : "Save"}
              </span>
            </button>
          </>
        )}
      </div>

      {savedFlash && (
        <div className="font-body text-xs px-1 pb-1 flex items-center gap-1" style={{ color: COL.mint }}>
          <Check size={13} color={COL.mint} /> Saved to Notes
        </div>
      )}

      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => !deleting && setShowDeleteModal(false)}
        >
          <div
            style={{ ...neu(false, 20), background: COL.card }}
            className="w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-display font-semibold text-base mb-1.5" style={{ color: COL.ink }}>
              Delete all chats?
            </div>
            <div className="font-body text-sm mb-4" style={{ color: COL.sub }}>
              This will permanently delete your entire conversation with Focusly AI. This can't be undone.
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                style={{
                  borderRadius: 14,
                  background: "linear-gradient(180deg, #5AA7FF 0%, #3D8CEF 100%)",
                  boxShadow: "8px 8px 20px rgba(0,0,0,0.55), -8px -8px 18px rgba(255,255,255,0.035)",
                  color: "#FFFFFF",
                }}
                className="flex-1 font-body text-sm font-semibold py-2.5 active:scale-[0.97] transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleClearChat}
                disabled={deleting}
                style={{ ...neu(false, 14), background: COL.coral }}
                className="flex-1 font-body text-sm font-semibold py-2.5 text-white active:scale-[0.97] transition disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete all"}
              </button>
            </div>
          </div>
        </div>
      )}

      {noteTargetStep && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => !savingNote && closeNoteTargetModal()}
        >
          <div
            style={{ ...neu(false, 20), background: COL.card }}
            className="w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            {noteTargetStep === "choose" && (
              <>
                <div className="font-display font-semibold text-base mb-1.5" style={{ color: COL.ink }}>
                  Save to Notes
                </div>
                <div className="font-body text-sm mb-4" style={{ color: COL.sub }}>
                  Start a new note, or add this to a note you already have?
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={confirmSaveAsNewNote}
                    disabled={savingNote}
                    style={{
                      borderRadius: 14,
                      background: "linear-gradient(180deg, #5AA7FF 0%, #3D8CEF 100%)",
                      boxShadow: "8px 8px 20px rgba(0,0,0,0.55), -8px -8px 18px rgba(255,255,255,0.035)",
                      color: "#FFFFFF",
                    }}
                    className="font-body text-sm font-semibold py-2.5 active:scale-[0.97] transition disabled:opacity-50"
                  >
                    {savingNote ? "Saving…" : "New note"}
                  </button>
                  <button
                    onClick={() => setNoteTargetStep("pickExisting")}
                    disabled={savingNote || existingNotes.length === 0}
                    style={neu(false, 14)}
                    className="font-body text-sm font-semibold py-2.5 active:scale-[0.97] transition disabled:opacity-70"
                  >
                    <span style={{ color: existingNotes.length === 0 ? COL.gold : COL.ink }}>
                      {existingNotes.length === 0 ? "No existing notes" : "Add to existing note"}
                    </span>
                  </button>
                  <button
                    onClick={closeNoteTargetModal}
                    disabled={savingNote}
                    className="font-body text-xs py-1.5"
                    style={{ color: COL.sub }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {noteTargetStep === "pickExisting" && (
              <>
                <div className="font-display font-semibold text-base mb-1.5" style={{ color: COL.ink }}>
                  Add to which note?
                </div>
                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto mb-2">
                  {existingNotes.map((note) => {
                    const safeTitle = typeof note.title === "string" ? note.title.trim() : "";
                    const safeText = typeof note.text === "string" ? note.text.trim() : "";
                    const snippet = safeTitle || safeText.split("\n")[0] || "Empty note";
                    return (
                      <button
                        key={note.id}
                        onClick={() => confirmAppendToNote(note)}
                        disabled={savingNote}
                        style={neu(false, 12)}
                        className="text-left px-3 py-2.5 active:scale-[0.98] transition disabled:opacity-50"
                      >
                        <div className="font-body text-sm truncate" style={{ color: COL.ink }}>
                          {snippet}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setNoteTargetStep("choose")}
                  disabled={savingNote}
                  className="font-body text-xs py-1.5"
                  style={{ color: COL.sub }}
                >
                  {savingNote ? "Saving…" : "Back"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto flex flex-col gap-3 py-2 pr-1">
        {!loaded && !loadFailed ? (
          <ChatSkeleton />
        ) : (
          <>
          {messages.map((m, i) => (
          <div
            key={i}
            className={`flex items-end gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}
            onClick={() => selectMode && toggleSelected(i)}
          >
            {selectMode && m.role !== "user" && (
              <SelectCheckbox checked={selectedIds.has(i)} />
            )}
            <div
              style={{
                ...neu(m.role === "user", 16),
                maxWidth: "82%",
                background: m.role === "user" ? "rgba(123,110,246,0.18)" : COL.card,
                outline: selectMode && selectedIds.has(i) ? `2px solid ${COL.violet}` : "none",
                cursor: selectMode ? "pointer" : "default",
              }}
              className="px-3 py-2"
            >
              {(m.imagePreviews?.length > 0 || m.imagePreview) && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {(m.imagePreviews || [m.imagePreview]).map((src, idx) => (
                    <img
                      key={idx}
                      src={src}
                      alt="attachment"
                      className="rounded-lg max-h-48 object-cover"
                      style={{ border: `1px solid ${COL.border}` }}
                    />
                  ))}
                </div>
              )}
              {m.content && (
                <div className="font-body text-sm whitespace-pre-wrap" style={{ color: COL.ink }}>
                  {m.content}
                </div>
              )}
            </div>
            {selectMode && m.role === "user" && (
              <SelectCheckbox checked={selectedIds.has(i)} />
            )}
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div style={neu(false, 16)} className="px-4 py-3 flex items-center gap-2">
              <Sparkles size={14} color={COL.violet} className="fai-sparkle" />
              <span className="font-body text-sm" style={{ color: COL.sub }}>Thinking</span>
              <span className="flex items-center gap-1">
                <span className="fai-dot" style={{ background: COL.violet, animationDelay: "0ms" }} />
                <span className="fai-dot" style={{ background: COL.violet, animationDelay: "160ms" }} />
                <span className="fai-dot" style={{ background: COL.violet, animationDelay: "320ms" }} />
              </span>
            </div>
          </div>
        )}
          </>
        )}
      </div>

      {(error || loadFailed) && (
        <div className="font-body text-xs px-1 pb-1" style={{ color: COL.coral }}>
          {error || "Couldn't load your saved chat — check your connection. Your previous messages are safe and will reappear once reloaded."}
        </div>
      )}

      {pendingImages.length > 0 && (
        <div className="flex items-center gap-2 px-1 pb-2 flex-wrap">
          {pendingImages.map((img, idx) => (
            <div key={idx} className="relative">
              <img
                src={img.dataUrl}
                alt="selected"
                className="w-14 h-14 rounded-lg object-cover"
                style={{ border: `1px solid ${COL.border}` }}
              />
              <button
                onClick={() => removePendingImage(idx)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: COL.coral }}
                aria-label="Remove image"
              >
                <X size={12} color="#fff" />
              </button>
            </div>
          ))}
          <div className="font-body text-xs" style={{ color: COL.sub }}>
            {pendingImages.length < MAX_IMAGES
              ? "Add a question or just send."
              : `Max ${MAX_IMAGES} photos.`}
          </div>
        </div>
      )}

      {!selectMode && (
      <div className="flex items-end gap-2 py-2">
        <button
          onClick={handlePickImage}
          disabled={sending || pendingImages.length >= MAX_IMAGES}
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
          multiple
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
          disabled={sending || (!input.trim() && pendingImages.length === 0)}
          style={neu(false, 14)}
          className="w-11 h-11 flex items-center justify-center flex-shrink-0 active:scale-[0.95] transition disabled:opacity-40"
          aria-label="Send"
        >
          <Send size={18} color={COL.violet} />
        </button>
      </div>
      )}

      <style>{`
        .fai-dot {
          width: 6px;
          height: 6px;
          border-radius: 9999px;
          display: inline-block;
          animation: fai-bounce 900ms ease-in-out infinite;
        }
        @keyframes fai-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        .fai-sparkle {
          animation: fai-pulse 1200ms ease-in-out infinite;
        }
        @keyframes fai-pulse {
          0%, 100% { transform: scale(1) rotate(0deg); opacity: 0.6; }
          50% { transform: scale(1.2) rotate(15deg); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function SelectCheckbox({ checked }) {
  return (
    <div
      className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mb-1"
      style={{ border: `2px solid ${checked ? COL.violet : COL.border}`, background: checked ? COL.violet : "transparent" }}
    >
      {checked && <Check size={12} color="#fff" />}
    </div>
  );
}
