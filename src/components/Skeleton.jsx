// src/components/Skeleton.jsx
import React from "react";
import { COL, neu } from "../theme";

// Base shimmering block. Uses the app's existing neumorphic card style so
// skeletons sit visually flush with the real content they stand in for.
function Bone({ w, h, r = 10, style = {} }) {
  return (
    <div
      className="skeleton-shimmer"
      style={{
        width: w,
        height: h,
        borderRadius: r,
        background: COL.track,
        ...style,
      }}
    />
  );
}

// Mirrors StatCard's shape (icon chip, big value line, label line).
function StatCardSkeleton() {
  return (
    <div style={neu(false, 20)} className="p-4 flex-1">
      <Bone w={32} h={32} r={12} style={{ marginBottom: 12 }} />
      <Bone w={64} h={22} r={6} style={{ marginBottom: 8 }} />
      <Bone w={80} h={12} r={5} />
    </div>
  );
}

// Mirrors StopwatchCard's shape (title row, ring, controls row).
function StopwatchCardSkeleton() {
  return (
    <div style={neu(false, 28)} className="p-6 flex flex-col items-center">
      <div className="w-full flex items-center justify-between mb-4">
        <Bone w={120} h={16} r={5} />
        <Bone w={90} h={22} r={999} />
      </div>
      <div className="relative flex items-center justify-center" style={{ width: 180, height: 180 }}>
        <div
          className="skeleton-shimmer"
          style={{ width: 180, height: 180, borderRadius: "50%", background: COL.track }}
        />
        <div className="absolute flex flex-col items-center">
          <Bone w={110} h={26} r={6} style={{ marginBottom: 8 }} />
          <Bone w={70} h={10} r={4} />
        </div>
      </div>
      <div className="flex items-center gap-3 mt-5">
        <Bone w={44} h={44} r={999} />
        <Bone w={64} h={44} r={999} />
        <div className="w-11 h-11" />
      </div>
    </div>
  );
}

// Full Home/Dashboard-shaped skeleton, shown while auth/profile/first data
// load is in flight so the layout doesn't visibly "pop" once real content
// arrives.
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <style>{`
        .skeleton-shimmer {
          position: relative;
          overflow: hidden;
        }
        .skeleton-shimmer::after {
          content: "";
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(
            90deg,
            transparent,
            rgba(242,242,247,0.06),
            transparent
          );
          animation: skeleton-sweep 1.4s ease-in-out infinite;
        }
        @keyframes skeleton-sweep {
          100% { transform: translateX(100%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .skeleton-shimmer::after { animation: none; }
        }
      `}</style>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bone w={44} h={44} r={16} />
          <div>
            <Bone w={90} h={11} r={4} style={{ marginBottom: 8 }} />
            <Bone w={130} h={16} r={5} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Bone w={40} h={40} r={999} />
          <Bone w={40} h={40} r={999} />
        </div>
      </div>

      <div className="flex gap-3">
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      <StopwatchCardSkeleton />

      <div style={neu(false, 20)} className="p-4 flex items-center gap-3">
        <Bone w={36} h={36} r={12} />
        <div>
          <Bone w={70} h={13} r={4} style={{ marginBottom: 6 }} />
          <Bone w={160} h={11} r={4} />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Bone w={140} h={14} r={5} />
        <div style={neu(false, 20)} className="p-4">
          <Bone w="100%" h={90} r={12} />
        </div>
      </div>
    </div>
  );
}

// Mirrors a chat bubble row (used a few times below, once per "side").
function ChatBubbleSkeleton({ align = "start", w = 200 }) {
  return (
    <div className={`flex ${align === "end" ? "justify-end" : "justify-start"}`}>
      <div style={neu(align === "end", 16)} className="px-3 py-2.5">
        <Bone w={w} h={12} r={5} style={{ marginBottom: 8 }} />
        <Bone w={w * 0.65} h={12} r={5} />
      </div>
    </div>
  );
}

// Shown inside the AI chat while the saved conversation is being fetched
// from Firestore, so the screen doesn't flash an empty "welcome" bubble
// and then pop in the real history a moment later.
export function ChatSkeleton() {
  return (
    <div className="flex flex-col gap-3 py-2">
      <style>{`
        .skeleton-shimmer {
          position: relative;
          overflow: hidden;
        }
        .skeleton-shimmer::after {
          content: "";
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(
            90deg,
            transparent,
            rgba(242,242,247,0.06),
            transparent
          );
          animation: skeleton-sweep 1.4s ease-in-out infinite;
        }
        @keyframes skeleton-sweep {
          100% { transform: translateX(100%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .skeleton-shimmer::after { animation: none; }
        }
      `}</style>
      <ChatBubbleSkeleton align="start" w={220} />
      <ChatBubbleSkeleton align="end" w={140} />
      <ChatBubbleSkeleton align="start" w={190} />
    </div>
  );
}

// Small full-screen variant for the very first paint (before we even know
// if there's a logged-in user), used in place of the plain "Loading…" text.
export function AppLoadingSkeleton() {
  return (
    <div className="flex-1 flex flex-col">
      <div className="px-5 pt-5">
        <div style={neu(false, 20)} className="p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bone w={28} h={28} r={999} />
            <Bone w={60} h={12} r={4} />
          </div>
          <Bone w={60} h={12} r={4} />
        </div>
      </div>
      <div className="flex-1 overflow-hidden px-5 pt-4">
        <DashboardSkeleton />
      </div>
    </div>
  );
}
