import React, { useEffect, useState } from "react";
import { ShoppingBag } from "lucide-react";

const COL = {
  bg: "#15151C", card: "#1C1C26", ink: "#F2F2F7", sub: "#8C8CA1",
  violet: "#7B6EF6", violetDeep: "#5C4CE0", blue: "#5AA7FF",
  mint: "#3FCFA3", coral: "#FF7A85", gold: "#FFB648",
  track: "#2A2A38", border: "#33333F", input: "#22222E",
};

export default function StoreIntroAnimation({ onDone }) {
  const [skippable, setSkippable] = useState(false);

  useEffect(() => {
    const revealSkip = setTimeout(() => setSkippable(true), 300);
    const finish = setTimeout(() => onDone && onDone(), 2200);
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
        background: `radial-gradient(circle at 50% 42%, #201a35 0%, ${COL.bg} 65%)`,
      }}
    >
      <style>{`
        @keyframes so-bg-drift { 0% { transform: scale(1) rotate(0deg); } 100% { transform: scale(1.2) rotate(-8deg); } }
        @keyframes so-star-twinkle { 0%, 100% { opacity: 0.15; transform: scale(0.6); } 50% { opacity: 1; transform: scale(1.15); } }
        @keyframes so-shock { 0% { transform: scale(0); opacity: 0.85; } 100% { transform: scale(7); opacity: 0; } }
        @keyframes so-ring { 0% { transform: scale(0.1); opacity: 0.9; } 60% { opacity: 0.18; } 100% { transform: scale(3); opacity: 0; } }
        @keyframes so-glow { 0%, 100% { opacity: 0.35; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.1); } }
        @keyframes so-orbit {
          0%   { transform: rotate(0deg) translateX(var(--so-r)) rotate(0deg) scale(0.7); opacity: 0; }
          15%  { opacity: 1; transform: rotate(54deg) translateX(var(--so-r)) rotate(-54deg) scale(1); }
          85%  { opacity: 1; }
          100% { transform: rotate(360deg) translateX(var(--so-r)) rotate(-360deg) scale(0.7); opacity: 0; }
        }
        @keyframes so-orbit-trail {
          0%   { opacity: 0; }
          20%  { opacity: 0.5; }
          80%  { opacity: 0.5; }
          100% { opacity: 0; }
        }
        @keyframes so-bag-in {
          0%   { transform: translateY(26px) scale(0.3) rotate(-12deg); opacity: 0; }
          50%  { transform: translateY(-9px) scale(1.2) rotate(6deg); opacity: 1; }
          70%  { transform: translateY(2px) scale(0.93) rotate(-2deg); }
          88%  { transform: translateY(-2px) scale(1.03); }
          100% { transform: translateY(0) scale(1) rotate(0deg); }
        }
        @keyframes so-bag-shine {
          0% { transform: translateX(-130%) skewX(-20deg); opacity: 0; }
          10% { opacity: 0.85; }
          32% { transform: translateX(150%) skewX(-20deg); opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes so-tag-pop {
          0%   { transform: scale(0) rotate(-20deg); opacity: 0; }
          60%  { transform: scale(1.25) rotate(8deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes so-coin-flip {
          0%   { transform: translateY(0) rotateY(0deg) scale(0); opacity: 0; }
          20%  { opacity: 1; transform: translateY(-8px) rotateY(180deg) scale(1); }
          100% { transform: translateY(0) rotateY(720deg) scale(1); opacity: 0; }
        }
        @keyframes so-text-rise { 0% { transform: translateY(16px); opacity: 0; letter-spacing: 6px; } 100% { transform: translateY(0); opacity: 1; letter-spacing: 2px; } }
        @keyframes so-subtext { 0% { transform: translateY(8px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
      `}</style>

      <div style={{
        position: "absolute", inset: -40, opacity: 0.5,
        background: `radial-gradient(circle at 30% 25%, ${COL.violet}26 0%, transparent 55%),
                     radial-gradient(circle at 72% 75%, ${COL.gold}1a 0%, transparent 50%)`,
        animation: "so-bg-drift 7s ease-in-out infinite alternate",
      }} />

      {STARS.map((s, i) => (
        <div key={i} style={{
          position: "absolute", left: s.x, top: s.y, width: s.size, height: s.size, borderRadius: "50%", background: "#fff",
          animation: `so-star-twinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
        }} />
      ))}

      {/* shockwave on entry */}
      <div style={{
        position: "absolute", width: 40, height: 40, borderRadius: "50%",
        background: `radial-gradient(circle, ${COL.violet}55 0%, transparent 70%)`,
        animation: "so-shock 0.85s ease-out 0.3s both",
      }} />

      {/* concentric rings */}
      <div style={{ position: "absolute", width: 120, height: 120, borderRadius: "50%", border: `2px solid ${COL.violet}`, animation: "so-ring 1.2s ease-out 0.3s both" }} />
      <div style={{ position: "absolute", width: 120, height: 120, borderRadius: "50%", border: `2px solid ${COL.gold}`, animation: "so-ring 1.2s ease-out 0.48s both" }} />

      {/* ambient glow */}
      <div style={{
        position: "absolute", width: 210, height: 210, borderRadius: "50%",
        background: `radial-gradient(circle, ${COL.violet}36 0%, transparent 70%)`,
        animation: "so-glow 1.7s ease-in-out infinite", filter: "blur(2px)",
      }} />

      {/* dual orbit rings of coins with faint trail ring */}
      <div style={{
        position: "absolute", width: 128, height: 128, borderRadius: "50%",
        border: `1px dashed ${COL.gold}44`, animation: "so-orbit-trail 2.5s ease-in-out 0.5s infinite",
      }} />
      {ORBIT_COINS.map((c, i) => (
        <div key={i} style={{
          position: "absolute", width: 17, height: 17, borderRadius: "50%",
          background: `radial-gradient(circle at 35% 30%, #ffe9a8, ${COL.gold})`,
          boxShadow: `0 0 8px ${COL.gold}aa`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, fontWeight: 800, color: "#5c3d00",
          "--so-r": `${c.radius}px`,
          animation: `so-orbit ${c.dur}s linear ${c.delay}s infinite`,
        }}>F</div>
      ))}

      {/* coin flips scattered */}
      {COIN_FLIPS.map((c, i) => (
        <div key={i} style={{
          position: "absolute", transform: `translate(${c.x}px, ${c.y}px)`, fontSize: 13,
          animation: `so-coin-flip 1.4s ease-out ${0.7 + c.delay}s infinite`,
        }}>🪙</div>
      ))}

      {/* shopping bag with shine sweep + sale tag */}
      <div style={{ position: "relative", animation: "so-bag-in 0.75s cubic-bezier(.34,1.56,.64,1) 0.12s both" }}>
        <div style={{
          width: 90, height: 90, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative", overflow: "hidden",
          background: `linear-gradient(140deg, ${COL.violet}, ${COL.violetDeep})`,
          boxShadow: `0 0 0 4px ${COL.bg}, 0 10px 28px rgba(0,0,0,0.5), 0 0 26px ${COL.violet}88`,
        }}>
          <ShoppingBag size={38} color="#fff" strokeWidth={1.7} />
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.55) 50%, transparent 60%)",
            animation: "so-bag-shine 1.6s ease-out 1s both",
          }} />
        </div>
        <div style={{
          position: "absolute", top: -6, right: -10, width: 30, height: 30, borderRadius: "50%",
          background: COL.gold, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, fontWeight: 800, color: "#5c3d00", boxShadow: `0 0 0 3px ${COL.bg}, 0 4px 10px rgba(0,0,0,0.4)`,
          animation: "so-tag-pop 0.5s cubic-bezier(.34,1.56,.64,1) 0.85s both",
        }}>
          NEW
        </div>
      </div>

      <div style={{ position: "absolute", bottom: "20%", textAlign: "center" }}>
        <div style={{ fontFamily: "inherit", fontWeight: 800, fontSize: 13, color: COL.ink, animation: "so-text-rise 0.6s cubic-bezier(.2,.8,.3,1) 1.05s both" }}>
          STORE
        </div>
        <div style={{ marginTop: 4, fontFamily: "inherit", fontWeight: 500, fontSize: 11.5, color: COL.sub, animation: "so-subtext 0.5s ease-out 1.25s both" }}>
          Fresh mascots await
        </div>
      </div>

      {skippable && (
        <div style={{ position: "absolute", top: 14, right: 18, fontSize: 11, color: COL.sub, animation: "so-subtext 0.4s ease-out both" }}>
          Tap to skip
        </div>
      )}
    </div>
  );
}

const STARS = [
  { x: "12%", y: "16%", size: 2, dur: 2.1, delay: 0 },
  { x: "84%", y: "13%", size: 2, dur: 1.9, delay: 0.35 },
  { x: "20%", y: "80%", size: 2, dur: 2.4, delay: 0.7 },
  { x: "88%", y: "72%", size: 3, dur: 2, delay: 0.15 },
  { x: "50%", y: "7%", size: 2, dur: 2.3, delay: 0.55 },
  { x: "7%", y: "50%", size: 2, dur: 2, delay: 0.9 },
  { x: "92%", y: "44%", size: 2, dur: 2.4, delay: 0.25 },
  { x: "40%", y: "88%", size: 2, dur: 1.9, delay: 0.45 },
];

const ORBIT_COINS = [
  { radius: 64, dur: 3.4, delay: 0 },
  { radius: 64, dur: 3.4, delay: -1.7 },
  { radius: 64, dur: 3.4, delay: -0.85 },
];

const COIN_FLIPS = [
  { x: -56, y: 34, delay: 0 },
  { x: 52, y: 38, delay: 0.35 },
  { x: 0, y: 48, delay: 0.7 },
  { x: -20, y: -60, delay: 0.5 },
];
