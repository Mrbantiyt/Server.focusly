import React, { useEffect, useState } from "react";
import { Trophy } from "lucide-react";

const COL = {
  bg: "#15151C", card: "#1C1C26", ink: "#F2F2F7", sub: "#8C8CA1",
  violet: "#7B6EF6", violetDeep: "#5C4CE0", blue: "#5AA7FF",
  mint: "#3FCFA3", coral: "#FF7A85", gold: "#FFB648",
  track: "#2A2A38", border: "#33333F", input: "#22222E",
};

export default function LeaderboardIntroAnimation({ onDone }) {
  const [skippable, setSkippable] = useState(false);

  useEffect(() => {
    const revealSkip = setTimeout(() => setSkippable(true), 300);
    const finish = setTimeout(() => onDone && onDone(), 2100);
    return () => {
      clearTimeout(revealSkip);
      clearTimeout(finish);
    };
  }, [onDone]);

  return (
    <div
      onClick={() => skippable && onDone && onDone()}
      style={{
        position: "absolute", inset: 0, zIndex: 10, display: "flex",
        alignItems: "center", justifyContent: "center", overflow: "hidden",
        borderRadius: 28, cursor: skippable ? "pointer" : "default",
        background: `radial-gradient(circle at 50% 45%, #201a35 0%, ${COL.bg} 65%)`,
      }}
    >
      <style>{`
        @keyframes lb2-bg-drift {
          0%   { transform: scale(1) rotate(0deg); }
          100% { transform: scale(1.15) rotate(6deg); }
        }
        @keyframes lb2-ring {
          0%   { transform: scale(0.1); opacity: 0.95; filter: blur(0px); }
          60%  { opacity: 0.25; }
          100% { transform: scale(3.4); opacity: 0; filter: blur(1px); }
        }
        @keyframes lb2-shock {
          0%   { transform: scale(0); opacity: 0.9; }
          100% { transform: scale(8); opacity: 0; }
        }
        @keyframes lb2-beam {
          0%   { transform: scaleY(0) translateY(10px); opacity: 0; }
          30%  { opacity: 0.55; }
          100% { transform: scaleY(1) translateY(0); opacity: 0; }
        }
        @keyframes lb2-glow-pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50%      { opacity: 0.9; transform: scale(1.12); }
        }
        @keyframes lb2-trophy-drop {
          0%   { transform: translateY(-60px) scale(0.3) rotate(-15deg); opacity: 0; }
          45%  { transform: translateY(6px) scale(1.18) rotate(6deg); opacity: 1; }
          62%  { transform: translateY(-10px) scale(0.95) rotate(-3deg); }
          78%  { transform: translateY(2px) scale(1.03) rotate(1deg); }
          100% { transform: translateY(0) scale(1) rotate(0deg); }
        }
        @keyframes lb2-trophy-shine {
          0%   { transform: translateX(-120%) skewX(-20deg); opacity: 0; }
          8%   { opacity: 0.9; }
          30%  { transform: translateX(140%) skewX(-20deg); opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes lb2-impact-dust {
          0%   { transform: scale(0.3); opacity: 0.9; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes lb2-bar {
          0%   { transform: scaleY(0); }
          55%  { transform: scaleY(1.15); }
          75%  { transform: scaleY(0.94); }
          100% { transform: scaleY(1); }
        }
        @keyframes lb2-spark {
          0%   { transform: translate(0,0) scale(0) rotate(0deg); opacity: 0; }
          15%  { opacity: 1; transform: translate(0,0) scale(1.3) rotate(20deg); }
          100% { transform: var(--lb2-end) scale(0.2) rotate(180deg); opacity: 0; }
        }
        @keyframes lb2-star-twinkle {
          0%, 100% { opacity: 0.15; transform: scale(0.6); }
          50%      { opacity: 1; transform: scale(1.15); }
        }
        @keyframes lb2-text-rise {
          0%   { transform: translateY(16px); opacity: 0; letter-spacing: 6px; }
          100% { transform: translateY(0); opacity: 1; letter-spacing: 2px; }
        }
        @keyframes lb2-subtext {
          0%   { transform: translateY(8px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        .lb2-bar { transform-origin: bottom; }
      `}</style>

      {/* slow drifting background glow for depth */}
      <div
        style={{
          position: "absolute", inset: -40, opacity: 0.5,
          background: `radial-gradient(circle at 35% 30%, ${COL.violet}22 0%, transparent 55%),
                       radial-gradient(circle at 70% 70%, ${COL.gold}18 0%, transparent 50%)`,
          animation: "lb2-bg-drift 6s ease-in-out infinite alternate",
        }}
      />

      {/* twinkling background stars for depth */}
      {STARS.map((s, i) => (
        <div key={i} style={{
          position: "absolute", left: s.x, top: s.y, width: s.size, height: s.size,
          borderRadius: "50%", background: "#fff",
          animation: `lb2-star-twinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
        }} />
      ))}

      {/* impact shockwave */}
      <div style={{
        position: "absolute", width: 40, height: 40, borderRadius: "50%",
        background: `radial-gradient(circle, ${COL.gold}55 0%, transparent 70%)`,
        animation: "lb2-shock 0.9s ease-out 0.45s both",
      }} />

      {/* light beams radiating from center */}
      {BEAMS.map((b, i) => (
        <div key={i} style={{
          position: "absolute", width: 3, height: 130, borderRadius: 4,
          background: `linear-gradient(to top, ${i % 2 === 0 ? COL.gold : COL.violet}, transparent)`,
          transform: `rotate(${b}deg) translateY(-40px)`,
          transformOrigin: "bottom center",
          animation: "lb2-beam 1s ease-out 0.4s both",
        }} />
      ))}

      {/* concentric rings, three layers for richness */}
      <div style={{ position: "absolute", width: 110, height: 110, borderRadius: "50%", border: `2px solid ${COL.gold}`, animation: "lb2-ring 1.3s ease-out 0.4s both" }} />
      <div style={{ position: "absolute", width: 110, height: 110, borderRadius: "50%", border: `2px solid ${COL.violet}`, animation: "lb2-ring 1.3s ease-out 0.58s both" }} />
      <div style={{ position: "absolute", width: 110, height: 110, borderRadius: "50%", border: `1.5px solid ${COL.blue}`, animation: "lb2-ring 1.3s ease-out 0.76s both" }} />

      {/* pulsing ambient glow behind trophy */}
      <div style={{
        position: "absolute", width: 220, height: 220, borderRadius: "50%",
        background: `radial-gradient(circle, ${COL.gold}30 0%, transparent 70%)`,
        animation: "lb2-glow-pulse 1.8s ease-in-out infinite",
        filter: "blur(2px)",
      }} />

      {/* gold sparks bursting outward, more of them + rotation */}
      {SPARKS.map((s, i) => (
        <div key={i} style={{
          position: "absolute", width: s.size, height: s.size, borderRadius: i % 3 === 0 ? "1px" : "50%",
          background: i % 2 === 0 ? COL.gold : COL.violet,
          boxShadow: `0 0 6px ${i % 2 === 0 ? COL.gold : COL.violet}`,
          "--lb2-end": `translate(${s.x}px, ${s.y}px)`,
          animation: `lb2-spark 1.1s cubic-bezier(.2,.7,.3,1) ${0.55 + s.delay}s both`,
        }} />
      ))}

      {/* rising rank bars, podium feel */}
      <div style={{ position: "absolute", bottom: "30%", display: "flex", alignItems: "flex-end", gap: 9 }}>
        <div className="lb2-bar" style={{ width: 22, height: 36, borderRadius: 7, background: `linear-gradient(180deg, ${COL.track}, ${COL.card})`, animation: "lb2-bar 0.55s cubic-bezier(.34,1.56,.64,1) 0.75s both" }} />
        <div className="lb2-bar" style={{ width: 22, height: 58, borderRadius: 7, background: `linear-gradient(180deg, ${COL.gold}80, ${COL.gold}30)`, boxShadow: `0 0 14px ${COL.gold}55`, animation: "lb2-bar 0.55s cubic-bezier(.34,1.56,.64,1) 0.85s both" }} />
        <div className="lb2-bar" style={{ width: 22, height: 28, borderRadius: 7, background: `linear-gradient(180deg, ${COL.track}, ${COL.card})`, animation: "lb2-bar 0.55s cubic-bezier(.34,1.56,.64,1) 0.95s both" }} />
      </div>

      {/* impact dust ring right as trophy lands */}
      <div style={{
        position: "absolute", width: 60, height: 14, borderRadius: "50%",
        background: `radial-gradient(ellipse, ${COL.gold}66 0%, transparent 75%)`,
        bottom: "calc(50% - 6px)",
        animation: "lb2-impact-dust 0.6s ease-out 0.55s both",
      }} />

      {/* trophy with drop-bounce + shine sweep */}
      <div style={{ position: "relative", animation: "lb2-trophy-drop 0.85s cubic-bezier(.34,1.56,.64,1) 0.1s both" }}>
        <div style={{
          width: 92, height: 92, borderRadius: "50%", display: "flex",
          alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden",
          background: `linear-gradient(145deg, #2a2440, ${COL.card})`,
          boxShadow: `0 0 0 4px ${COL.bg}, 0 8px 28px rgba(0,0,0,0.5), 0 0 26px ${COL.gold}55`,
        }}>
          <Trophy size={40} color={COL.gold} strokeWidth={1.8} fill={`${COL.gold}33`} />
          <div style={{
            position: "absolute", inset: 0, background: "linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.55) 50%, transparent 60%)",
            animation: "lb2-trophy-shine 1.6s ease-out 0.95s both",
          }} />
        </div>
      </div>

      {/* label with letter-spacing settle */}
      <div style={{
        marginTop: 168, position: "absolute", bottom: "17%", textAlign: "center",
      }}>
        <div style={{
          fontFamily: "inherit", fontWeight: 800, fontSize: 13, color: COL.gold,
          animation: "lb2-text-rise 0.6s cubic-bezier(.2,.8,.3,1) 1.05s both",
        }}>
          LEADERBOARD
        </div>
        <div style={{
          marginTop: 4, fontFamily: "inherit", fontWeight: 500, fontSize: 11.5, color: COL.sub,
          animation: "lb2-subtext 0.5s ease-out 1.25s both",
        }}>
          See how you rank this week
        </div>
      </div>

      {skippable && (
        <div style={{ position: "absolute", top: 14, right: 18, fontSize: 11, color: COL.sub, animation: "lb2-subtext 0.4s ease-out both" }}>
          Tap to skip
        </div>
      )}
    </div>
  );
}

const STARS = [
  { x: "10%", y: "15%", size: 2, dur: 2.2, delay: 0 },
  { x: "85%", y: "12%", size: 2, dur: 1.9, delay: 0.3 },
  { x: "18%", y: "82%", size: 2, dur: 2.5, delay: 0.6 },
  { x: "90%", y: "75%", size: 3, dur: 2.1, delay: 0.15 },
  { x: "48%", y: "6%", size: 2, dur: 2.3, delay: 0.5 },
  { x: "6%", y: "48%", size: 2, dur: 2, delay: 0.9 },
  { x: "94%", y: "42%", size: 2, dur: 2.4, delay: 0.25 },
  { x: "38%", y: "90%", size: 2, dur: 1.8, delay: 0.4 },
  { x: "62%", y: "88%", size: 2, dur: 2.2, delay: 0.7 },
  { x: "72%", y: "20%", size: 2, dur: 2, delay: 0.1 },
];

const BEAMS = [0, 45, 90, 135, 180, 225, 270, 315];

const SPARKS = [
  { x: -58, y: -42, size: 4, delay: 0 },
  { x: 54, y: -46, size: 5, delay: 0.02 },
  { x: -68, y: 6, size: 4, delay: 0.05 },
  { x: 64, y: 10, size: 5, delay: 0.01 },
  { x: -38, y: -66, size: 3, delay: 0.07 },
  { x: 36, y: -70, size: 4, delay: 0.04 },
  { x: -18, y: 70, size: 4, delay: 0.09 },
  { x: 20, y: 72, size: 3, delay: 0.06 },
  { x: -82, y: -14, size: 4, delay: 0.1 },
  { x: 80, y: -10, size: 3, delay: 0.03 },
  { x: -8, y: -80, size: 3, delay: 0.12 },
  { x: 6, y: 84, size: 4, delay: 0.08 },
];
