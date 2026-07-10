// src/components/Notes.jsx
// Replaces the old "Tasks" tab with a plain notes list, like the built-in
// Notes app every phone has. No character limit is enforced anywhere here —
// a note can be as long as you want to type.
import React, { useEffect, useRef, useState } from "react";
import { Plus, Trash2, ChevronLeft, StickyNote } from "lucide-react";
import { COL, neu } from "../theme";
import { addNote, updateNote, deleteNote } from "../lib/firestore";

// How long to wait after the last keystroke before writing to Firestore.
// Typing itself always feels instant (it only ever touches local state);
// this just avoids sending a network write on every single keystroke.
const SAVE_DEBOUNCE_MS = 500;

function formatWhen(ts) {
  if (!ts?.seconds) return "";
  const d = new Date(ts.seconds * 1000);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Notes({ uid, notes }) {
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);

  const openNote = notes.find((n) => n.id === openId);

  const handleNew = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const id = await addNote(uid, "");
      setOpenId(id);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (id) => {
    if (openId === id) setOpenId(null);
    deleteNote(uid, id);
  };

  if (openNote) {
    return (
      <NoteEditor
        uid={uid}
        note={openNote}
        onBack={() => setOpenId(null)}
        onDelete={() => handleDelete(openNote.id)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="font-display font-semibold text-lg" style={{ color: COL.ink }}>Notes</div>
        <button
          onClick={handleNew}
          disabled={creating}
          style={neu(false, 14)}
          className="flex items-center gap-1.5 px-3 h-9 active:scale-[0.95] transition disabled:opacity-50"
        >
          <Plus size={15} color={COL.violet} />
          <span className="font-body text-xs font-semibold" style={{ color: COL.violet }}>New note</span>
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {notes.map((n) => {
          const heading = n.title?.trim() || n.text?.trim()?.split("\n")[0] || "";
          // When there's no explicit title, the first line of the body is
          // already shown as the heading, so the preview below skips it to
          // avoid repeating the same line twice.
          const preview = n.title?.trim()
            ? n.text?.trim() || ""
            : n.text?.trim()?.split("\n").slice(1).join("\n").trim() || "";
          return (
            <button
              key={n.id}
              onClick={() => setOpenId(n.id)}
              style={neu(false, 18)}
              className="p-3.5 flex items-start gap-3 text-left active:scale-[0.98] transition"
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(123,110,246,0.15)" }}>
                <StickyNote size={14} color={COL.violet} />
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="font-body text-sm font-semibold truncate"
                  style={{ color: heading ? COL.ink : COL.sub }}
                >
                  {heading || "Empty note"}
                </div>
                {preview && (
                  <div
                    className="font-body text-xs whitespace-pre-wrap line-clamp-2 mt-0.5"
                    style={{ color: COL.sub }}
                  >
                    {preview}
                  </div>
                )}
                <div className="font-body text-[11px] mt-1" style={{ color: COL.sub }}>{formatWhen(n.updatedAt)}</div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(n.id); }}
                className="flex-shrink-0 p-1"
                aria-label="Delete note"
              >
                <Trash2 size={15} color={COL.sub} />
              </button>
            </button>
          );
        })}

        {notes.length === 0 && (
          <div className="font-body text-sm text-center py-8" style={{ color: COL.sub }}>
            No notes yet — tap "New note" to add one.
          </div>
        )}
      </div>

      <style>{`
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}

function NoteEditor({ uid, note, onBack, onDelete }) {
  // Local-first: typing only ever touches this state, so it's always
  // instant regardless of network speed. The Firestore write is debounced
  // in the background and also flushed immediately on the way out.
  const [title, setTitle] = useState(note.title || "");
  const [text, setText] = useState(note.text || "");
  const titleRef = useRef(title);
  titleRef.current = title;
  const textRef = useRef(text);
  textRef.current = text;
  const saveTimer = useRef(null);
  const titleInputRef = useRef(null);
  const taRef = useRef(null);

  // If a remote edit comes in for the SAME note (e.g. edited on another
  // device) while this one isn't focused, reflect it — but never stomp on
  // what the user is actively typing right now.
  useEffect(() => {
    if (document.activeElement !== taRef.current) setText(note.text || "");
    if (document.activeElement !== titleInputRef.current) setTitle(note.title || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id, note.text, note.title]);

  const flush = () => {
    clearTimeout(saveTimer.current);
    updateNote(uid, note.id, { title: titleRef.current, text: textRef.current });
  };

  const scheduleSave = () => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(
      () => updateNote(uid, note.id, { title: titleRef.current, text: textRef.current }),
      SAVE_DEBOUNCE_MS
    );
  };

  const handleTitleChange = (e) => {
    setTitle(e.target.value); // no maxLength — same as the body
    scheduleSave();
  };

  const handleChange = (e) => {
    const value = e.target.value; // no maxLength anywhere — notes can be as long as you like
    setText(value);
    scheduleSave();
  };

  // Flush on unmount (navigating back) and when the tab/app is hidden/closed.
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", flush);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-center justify-between">
        <button onClick={() => { flush(); onBack(); }} className="flex items-center gap-1 active:scale-[0.95] transition">
          <ChevronLeft size={18} color={COL.sub} />
          <span className="font-body text-sm" style={{ color: COL.sub }}>Notes</span>
        </button>
        <button onClick={() => { flush(); onDelete(); }} className="p-1.5" aria-label="Delete note">
          <Trash2 size={16} color={COL.coral} />
        </button>
      </div>

      <input
        ref={titleInputRef}
        value={title}
        onChange={handleTitleChange}
        placeholder="Title"
        autoFocus={!note.title && !note.text}
        className="font-display font-semibold text-lg outline-none bg-transparent"
        style={{ color: COL.ink }}
      />
      <div style={{ height: 1, background: COL.border }} />

      <textarea
        ref={taRef}
        value={text}
        onChange={handleChange}
        placeholder="Start typing…"
        // No `maxLength` prop and no client-side length check anywhere in
        // this file — a note can grow as large as you want to type.
        style={{ color: COL.ink, resize: "none" }}
        className="flex-1 font-body text-sm outline-none bg-transparent"
      />
    </div>
  );
}
