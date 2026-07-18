// src/components/TodaySubjects.jsx
import React from "react";
import { BookOpen } from "lucide-react";
import { COL, neu } from "../theme";
import { fmtHrs } from "../lib/time";

// Shows how long each subject (from the Custom Timer) has been studied
// TODAY only — no week/month rollup, resets naturally every day since it
// just renders whatever's in the day's subjectSeconds map.
export function TodaySubjects({ subjectSeconds }) {
  const entries = Object.entries(subjectSeconds || {})
    .filter(([, sec]) => sec > 0)
    .sort((a, b) => b[1] - a[1]);

  if (!entries.length) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="font-display font-bold text-sm px-0.5" style={{ color: COL.ink }}>Today by Subject</div>
      <div style={neu(false, 20)} className="p-4 flex flex-col gap-3">
        {entries.map(([subject, seconds]) => (
          <div key={subject} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(63,207,163,0.14)" }}>
                <BookOpen size={13} color={COL.mint} />
              </div>
              <span className="font-body text-sm" style={{ color: COL.ink }}>{subject}</span>
            </div>
            <span className="font-body text-xs font-semibold" style={{ color: COL.mint }}>{fmtHrs(seconds)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
