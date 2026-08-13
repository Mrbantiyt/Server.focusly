"use client";

import { useEffect, useState } from "react";

const BASE = 214;

export default function ListenerCount() {
  const [count, setCount] = useState(BASE);

  useEffect(() => {
    const interval = setInterval(() => {
      setCount((prev) => {
        const drift = Math.floor(Math.random() * 5) - 2;
        const next = prev + drift;
        return Math.min(340, Math.max(120, next));
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="glass-chip flex min-w-0 items-center gap-2 rounded-pill px-3 py-2 sm:px-4">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rust-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-rust-400" />
      </span>
      <span className="truncate text-xs font-medium tracking-wide text-amber-100 sm:text-sm">
        {count.toLocaleString("en-US")} listening now
      </span>
    </div>
  );
}
