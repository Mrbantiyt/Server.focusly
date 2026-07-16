import React, { useEffect, useState } from "react";
import { Shield, Sparkles } from "lucide-react";

const COL = {
  bg: "#15151C", card: "#1C1C26", ink: "#F2F2F7", sub: "#8C8CA1",
  violet: "#7B6EF6", violetDeep: "#5C4CE0", blue: "#5AA7FF",
  mint: "#3FCFA3", coral: "#FF7A85", gold: "#FFB648",
  track: "#2A2A38", border: "#33333F", input: "#22222E",
};

export default function LevelUpAnimation({ level = 5, coinsAwarded = 1000, onDone }) {
  const [skippable, setSkippable] = useState(false);

  useEffect(() => {
    const revealSkip = setTimeout(() => setSkippable(true), 300);
    const finish = setTimeout(() => onDone && onDone(), 2600);
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
        flexDirection: "column", alignItems: "center", justifyContent: "center",
        overflow: "hidden", borderRadius: 28, cursor: skippable ? "pointer" : "default",
        background: `radial-gradient(circle at 50% 40%, #241b3d 0%, ${COL.bg} 65%)`,
      }}
    >
      <style>{`
        @keyframes lu2-bg-drift { 0% { transform: scale(1) rotate(0deg); } 100% { transform: scale(1.18) rotate(-6deg); } }
        @keyframes lu2-flash { 0% { opacity: 0; } 8% { opacity: 0.55; } 100% { opacity: 0; } }
        @keyframes lu2-shock { 0% { transform: scale(0); opacity: 0.95; } 100% { transform: scale(9); opacity: 0; } }
        @keyframes lu2-ring { 0% { transform: scale(0.1); opacity: 0.95; } 60% { opacity: 0.2; } 100% { transform: scale(3.6); opacity: 0; } }
        @keyframes lu2-beam { 0% { transform: scaleY(0) translateY(10px); opacity: 0; } 25% { opacity: 0.6; } 100% { transform: scaleY(1) translateY(0); opacity: 0; } }
        @keyframes lu2-star-twinkle { 0%, 100% { opacity: 0.15; transform: scale(0.6); } 50% { opacity: 1; transform: scale(1.15); } }
        @keyframes lu2-badge-in {
          0%   { transform: translateY(30px) scale(0.25) rotate(-14deg); opacity: 0; }
          50%  { transform: translateY(-10px) scale(1.22) rotate(6deg); opacity: 1; }
          70%  { transform: translateY(2px) scale(0.92) rotate(-3deg); }
          85%  { transform: translateY(-3px) scale(1.04) rotate(1deg); }
          100% { transform: translateY(0) scale(1) rotate(0deg); }
        }
        @keyframes lu2-badge-shine {
          0% { transform: translateX(-130%) skewX(-20deg); opacity: 0; }
          10% { opacity: 0.9; }
          32% { transform: translateX(150%) skewX(-20deg); opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes lu2-badge-pulse-ring {
          0%   { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes lu2-glow-pulse { 0%, 100% { opacity: 0.4; transform: scale(1); } 50% { opacity: 0.9; transform: scale(1.1); } }
        @keyframes lu2-confetti {
          0%   { transform: translate(0,0) rotate(0deg); opacity: 0; }
          10%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: var(--lu2-end) rotate(var(--lu2-rot)); opacity: 0; }
        }
        @keyframes lu2-confetti-fall {
          0%   { transform: translateY(-10px) rotate(0deg); opacity: 0; }
          15%  { opacity: 1; }
          100% { transform: translateY(160px) rotate(var(--lu2-rot)); opacity: 0; }
        }
        @keyframes lu2-text-rise { 0% { transform: translateY(16px); opacity: 0; letter-spacing: 7px; } 100% { transform: translateY(0); opacity: 1; letter-spacing: 3px; } }
        @keyframes lu2-num-tick {
          0%   { transform: scale(0.4) rotateX(90deg); opacity: 0; }
          55%  { transform: scale(1.3) rotateX(0deg); opacity: 1; }
          75%  { transform: scale(0.92); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes lu2-sparkle-spin { 0% { transform: rotate(0deg) scale(0.4); opacity: 0; } 30% { opacity: 1; } 100% { transform: rotate(200deg) scale(1.1); opacity: 0; } }
        @keyframes lu2-coin-pill-in { 0% { transform: translateY(12px) scale(0.85); opacity: 0; } 100% { transform: translateY(0) scale(1); opacity: 1; } }
        @keyframes lu2-coin-rise { 0% { transform: translateY(0) scale(0.7); opacity: 0; } 20% { opacity: 1; transform: translateY(-4px) scale(1); } 100% { transform: translateY(-20px) scale(0.8); opacity: 0; } }
      `}</style>

      <div style={{
        position: "absolute", inset: -40, opacity: 0.55,
        background: `radial-gradient(circle at 30% 30%, ${COL.violet}28 0%, transparent 55%),
                     radial-gradient(circle at 75% 70%, ${COL.gold}1e 0%, transparent 50%)`,
        animation: "lu2-bg-drift 6s ease-in-out infinite alternate",
      }} />

      {/* white flash on level-up impact */}
      <div style={{ position: "absolute", inset: 0, background: "#fff", animation: "lu2-flash 0.5s ease-out 0.28s both" }} />

      {STARS.map((s, i) => (
        <div key={i} style={{
          position: "absolute", left: s.x, top: s.y, width: s.size, height: s.size, borderRadius: "50%", background: "#fff",
          animation: `lu2-star-twinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
        }} />
      ))}

      {/* falling confetti from top, more premium than radial burst alone */}
      {CONFETTI_FALL.map((c, i) => (
        <div key={`f${i}`} style={{
          position: "absolute", left: c.x, top: -10, width: c.size, height: c.size * 0.42, borderRadius: 2,
          background: c.color, "--lu2-rot": `${c.rot}deg`,
          animation: `lu2-confetti-fall ${1.6 + c.dur}s ease-in ${0.5 + c.delay}s both`,
        }} />
      ))}

      {/* shockwave */}
      <div style={{
        position: "absolute", width: 50, height: 50, borderRadius: "50%",
        background: `radial-gradient(circle, ${COL.violet}77 0%, transparent 70%)`,
        animation: "lu2-shock 0.85s ease-out 0.28s both",
      }} />

      {/* radiating beams */}
      {BEAMS.map((b, i) => (
        <div key={i} style={{
          position: "absolute", width: 3, height: 140, borderRadius: 4,
          background: `linear-gradient(to top, ${i % 2 === 0 ? COL.violet : COL.gold}, transparent)`,
          transform: `rotate(${b}deg) translateY(-40px)`, transformOrigin: "bottom center",
          animation: "lu2-beam 1s ease-out 0.35s both",
        }} />
      ))}

      {/* concentric rings */}
      <div style={{ position: "absolute", width: 130, height: 130, borderRadius: "50%", border: `2px solid ${COL.violet}`, animation: "lu2-ring 1.2s ease-out 0.4s both" }} />
      <div style={{ position: "absolute", width: 130, height: 130, borderRadius: "50%", border: `2px solid ${COL.gold}`, animation: "lu2-ring 1.2s ease-out 0.56s both" }} />
      <div style={{ position: "absolute", width: 130, height: 130, borderRadius: "50%", border: `1.5px solid ${COL.blue}`, animation: "lu2-ring 1.2s ease-out 0.72s both" }} />

      {/* ambient glow */}
      <div style={{
        position: "absolute", width: 230, height: 230, borderRadius: "50%",
        background: `radial-gradient(circle, ${COL.violet}38 0%, transparent 70%)`,
        animation: "lu2-glow-pulse 1.8s ease-in-out infinite", filter: "blur(2px)",
      }} />

      {/* confetti burst (radial, mid-air) */}
      {CONFETTI.map((c, i) => (
        <div key={i} style={{
          position: "absolute", width: c.size, height: c.size * 0.4, borderRadius: 2, background: c.color,
          "--lu2-end": `translate(${c.x}px, ${c.y}px)`, "--lu2-rot": `${c.rot}deg`,
          animation: `lu2-confetti 1.2s cubic-bezier(.2,.7,.3,1) ${0.4 + c.delay}s both`,
        }} />
      ))}

      {/* sparkles */}
      {SPARKLES.map((s, i) => (
        <div key={i} style={{
          position: "absolute", transform: `translate(${s.x}px, ${s.y}px)`,
          animation: `lu2-sparkle-spin 1.1s ease-out ${0.65 + s.delay}s both`,
        }}>
          <Sparkles size={s.size} color={COL.gold} fill={COL.gold} />
        </div>
      ))}

      {/* shield badge with pulse rings + shine */}
      <div style={{ position: "relative", animation: "lu2-badge-in 0.85s cubic-bezier(.34,1.56,.64,1) 0.1s both" }}>
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%", border: `2px solid ${COL.gold}77`,
          animation: "lu2-badge-pulse-ring 1.6s ease-out 1s infinite",
        }} />
        <div style={{
          width: 96, height: 96, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative", overflow: "hidden",
          background: `linear-gradient(140deg, ${COL.violet}, ${COL.violetDeep})`,
          boxShadow: `0 0 0 4px ${COL.bg}, 0 10px 30px rgba(0,0,0,0.5), 0 0 30px ${COL.violet}99`,
        }}>
          <Shield size={42} color="#fff" fill={COL.gold} strokeWidth={1.5} />
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.6) 50%, transparent 60%)",
            animation: "lu2-badge-shine 1.6s ease-out 1.1s both",
          }} />
        </div>
      </div>

      <div style={{ marginTop: 18, fontFamily: "inherit", fontWeight: 800, fontSize: 12, color: COL.gold, animation: "lu2-text-rise 0.6s cubic-bezier(.2,.8,.3,1) 0.6s both" }}>
        LEVEL UP
      </div>

      <div style={{ marginTop: 2, fontFamily: "inherit", fontWeight: 800, fontSize: 32, color: COL.ink, animation: "lu2-num-tick 0.55s cubic-bezier(.34,1.56,.64,1) 0.78s both", transformStyle: "preserve-3d" }}>
        Level {level}
      </div>

      <div style={{
        marginTop: 12, position: "relative", display: "flex", alignItems: "center", gap: 6,
        padding: "7px 16px", borderRadius: 999, background: COL.card,
        boxShadow: `0 4px 16px rgba(0,0,0,0.4), inset 0 0 0 1px ${COL.gold}33`,
        animation: "lu2-coin-pill-in 0.5s cubic-bezier(.34,1.56,.64,1) 1.05s both",
      }}>
        <span style={{ fontSize: 14 }}>🪙</span>
        <span style={{ fontFamily: "inherit", fontWeight: 700, fontSize: 13, color: COL.ink }}>
          +{coinsAwarded.toLocaleString("en-US")}
        </span>
        {[0, 0.35, 0.7].map((d, i) => (
          <span key={i} style={{ position: "absolute", left: 10 + i * 8, top: -4, fontSize: 10, animation: `lu2-coin-rise 1.6s ease-out ${1.3 + d}s infinite` }}>🪙</span>
        ))}
      </div>

      {skippable && (
        <div style={{ position: "absolute", top: 14, right: 18, fontSize: 11, color: COL.sub }}>Tap to skip</div>
      )}
    </div>
  );
}

const STARS = [
  { x: "10%", y: "12%", size: 2, dur: 2.1, delay: 0 },
  { x: "86%", y: "10%", size: 2, dur: 1.9, delay: 0.3 },
  { x: "16%", y: "84%", size: 2, dur: 2.4, delay: 0.6 },
  { x: "90%", y: "78%", size: 3, dur: 2, delay: 0.15 },
  { x: "50%", y: "5%", size: 2, dur: 2.3, delay: 0.5 },
  { x: "5%", y: "45%", size: 2, dur: 2, delay: 0.9 },
  { x: "94%", y: "40%", size: 2, dur: 2.4, delay: 0.25 },
];

const BEAMS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

const CONFETTI = [
  { x: -80, y: -55, size: 8, color: COL.gold, rot: 130, delay: 0 },
  { x: 76, y: -60, size: 7, color: COL.violet, rot: -110, delay: 0.02 },
  { x: -95, y: 12, size: 7, color: COL.mint, rot: 210, delay: 0.05 },
  { x: 92, y: 18, size: 8, color: COL.coral, rot: -170, delay: 0.01 },
  { x: -58, y: -90, size: 6, color: COL.blue, rot: 90, delay: 0.07 },
  { x: 54, y: -95, size: 7, color: COL.gold, rot: -70, delay: 0.04 },
  { x: -25, y: 88, size: 7, color: COL.violet, rot: 50, delay: 0.09 },
  { x: 28, y: 90, size: 6, color: COL.mint, rot: -40, delay: 0.06 },
  { x: -112, y: -22, size: 7, color: COL.coral, rot: 170, delay: 0.11 },
  { x: 110, y: -20, size: 7, color: COL.gold, rot: -150, delay: 0.03 },
  { x: -10, y: -105, size: 6, color: COL.blue, rot: 20, delay: 0.13 },
  { x: 12, y: 108, size: 6, color: COL.coral, rot: -20, delay: 0.08 },
];

const CONFETTI_FALL = [
  { x: "15%", size: 7, color: COL.gold, rot: 200, dur: 0.2, delay: 0 },
  { x: "30%", size: 6, color: COL.violet, rot: -160, dur: 0.4, delay: 0.15 },
  { x: "48%", size: 7, color: COL.mint, rot: 120, dur: 0.1, delay: 0.05 },
  { x: "62%", size: 6, color: COL.coral, rot: -190, dur: 0.35, delay: 0.25 },
  { x: "78%", size: 7, color: COL.gold, rot: 220, dur: 0.15, delay: 0.1 },
  { x: "88%", size: 6, color: COL.blue, rot: -140, dur: 0.3, delay: 0.2 },
  { x: "8%", size: 5, color: COL.violet, rot: 100, dur: 0.25, delay: 0.3 },
  { x: "95%", size: 6, color: COL.mint, rot: -100, dur: 0.2, delay: 0.35 },
];

const SPARKLES = [
  { x: -66, y: -66, size: 15, delay: 0 },
  { x: 64, y: -68, size: 13, delay: 0.08 },
  { x: -72, y: 46, size: 11, delay: 0.15 },
  { x: 70, y: 48, size: 13, delay: 0.05 },
  { x: 0, y: -92, size: 10, delay: 0.2 },
];
