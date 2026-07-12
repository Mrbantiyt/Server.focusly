// src/components/Leaderboard.jsx
import React from "react";
import { X, Trophy, Flame, Shield } from "lucide-react";
import { COL, neu } from "../theme";
import { fmtHrs } from "../lib/time";

// Rank badge: gold/silver/bronze for top 3, plain number otherwise.
function RankBadge({ rank }) {
  const medal = rank === 1 ? "#FFD447" : rank === 2 ? "#C9CDD6" : rank === 3 ? "#E0A868" : null;
  return (
    <div
      className="w-8 h-8 flex items-center justify-center rounded-full font-display font-bold text-xs shrink-0"
      style={
        medal
          ? { background: medal, color: "#1C1C26" }
          : { background: COL.track, color: COL.sub }
      }
    >
      {rank}
    </div>
  );
}

function Row({ rank, row, isMe }) {
  return (
    <div
      style={isMe ? { ...neu(true, 18), border: `1px solid ${COL.violet}55` } : neu(false, 18)}
      className="flex items-center gap-3 p-3"
    >
      <RankBadge rank={rank} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-display font-semibold text-sm truncate" style={{ color: COL.ink }}>
            @{row.username || "anonymous"}
          </span>
          {isMe && (
            <span
              className="font-body text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
              style={{ background: `${COL.violet}22`, color: COL.violet }}
            >
              You
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <div className="flex items-center gap-1">
            <Flame size={11} color={row.streak > 0 ? COL.coral : COL.sub} />
            <span className="font-body text-[11px]" style={{ color: COL.sub }}>{row.streak || 0}</span>
          </div>
          <div className="flex items-center gap-1">
            <Shield size={11} color={COL.violet} />
            <span className="font-body text-[11px]" style={{ color: COL.sub }}>Lv {row.level || 0}</span>
          </div>
        </div>
      </div>

      <div className="text-right shrink-0">
        <div className="font-display font-bold text-sm" style={{ color: COL.ink }}>
          {fmtHrs(row.weeklyStudySeconds || 0)}
        </div>
        <div className="font-body text-[10px]" style={{ color: COL.sub }}>this week</div>
      </div>
    </div>
  );
}

export default function Leaderboard({ rows, loading, myUid, onClose }) {
  const myRank = rows.findIndex((r) => r.uid === myUid) + 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,18,40,0.55)" }}>
      <div className="w-full max-w-sm rounded-[28px] p-6 max-h-[90vh] flex flex-col" style={{ background: COL.bg }}>
        <div className="flex items-center justify-between mb-6 shrink-0">
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full" style={neu(false, 999)}>
            <X size={16} color={COL.sub} />
          </button>
          <span className="font-display font-bold text-lg" style={{ color: COL.ink }}>Leaderboard</span>
          <div className="w-9 h-9" />
        </div>

        <div className="flex flex-col items-center gap-1 mb-6 shrink-0">
          <div style={neu(false, 999)} className="flex items-center gap-2 px-5 py-2.5">
            <Trophy size={18} color={COL.gold} />
            <span className="font-display font-bold text-sm" style={{ color: COL.ink }}>
              {myRank > 0 ? `Your rank: #${myRank}` : "Study to get ranked"}
            </span>
          </div>
          <span className="font-body text-[10px]" style={{ color: COL.sub }}>Resets every Monday</span>
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={neu(false, 18)} className="h-16 animate-pulse" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-10 font-body text-sm" style={{ color: COL.sub }}>
              No one on the leaderboard this week yet. Start a study session to be the first!
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {rows.map((row, i) => (
                <Row key={row.uid} rank={i + 1} row={row} isMe={row.uid === myUid} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
