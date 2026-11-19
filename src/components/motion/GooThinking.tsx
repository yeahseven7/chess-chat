"use client";

import { useEffect, useRef } from "react";
import { createSpring, stepSpring, subscribe, targetSpring, prefersReducedMotion } from "@/lib/motion/springs";

/**
 * Goo Thinking port: three dots hop one after another (springs 300 22) through
 * an SVG goo filter so they stretch toward each other. Used as the subtle
 * "Analyzing…" indicator while Gemini works; never covers message text.
 */
export function GooThinking({ label = "Analyzing" }: { label?: string }) {
  const dots = useRef<Array<HTMLSpanElement | null>>([]);
  const s = useRef([0, 1, 2].map(() => createSpring(0, "goo")));

  useEffect(() => {
    if (prefersReducedMotion()) return;
    let k = 0;
    let hop = 0.3;
    return subscribe((dt) => {
      if ((hop -= dt) <= 0) {
        s.current[k % 3]!.v = -95;
        k++;
        hop = k % 3 ? 0.16 : 0.46;
      }
      s.current.forEach((spring, i) => {
        stepSpring(spring, dt);
        const dot = dots.current[i];
        const x = 2 + i * 4.5;
        if (dot) {
          dot.style.transform = `translate(${x.toFixed(1)}px, ${(15.5 + spring.x).toFixed(2)}px) scale(${Math.max(0.2, 1 + spring.x / 120).toFixed(3)})`;
        }
      });
    });
  }, []);

  return (
    <span role="status" aria-label={label} className="relative inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-ink-600" title={label}>
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <filter id="chat-dotgoo" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" />
        </filter>
      </svg>
      <span className="absolute inset-0 overflow-hidden" style={{ filter: "url(#chat-dotgoo)" }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            ref={(node) => {
              dots.current[i] = node;
            }}
            className="absolute left-[4px] top-0 h-[9px] w-[9px] rounded-full bg-cream-500 will-change-transform"
            style={{ transform: `translate(0px, ${prefersReducedMotion() ? 15.5 : 15.5 + i * 0}px)` }}
          />
        ))}
      </span>
    </span>
  );
}
