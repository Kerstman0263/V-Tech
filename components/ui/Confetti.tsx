"use client";

import { useMemo } from "react";

const COLORS = ["#7c3aed", "#10b981", "#f59e0b", "#a78bfa", "#f43f5e", "#8b5cf6"];

// Feestelijke confettiregen (pure CSS-animatie, geen externe library).
export function Confetti({ count = 90 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        key: i,
        left: Math.random() * 100,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        delay: Math.random() * 0.5,
        duration: 2.4 + Math.random() * 1.8,
        width: 7 + Math.random() * 6,
      })),
    [count],
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.key}
          className="vtech-confetti-piece"
          style={{
            left: `${p.left}%`,
            width: `${p.width}px`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
