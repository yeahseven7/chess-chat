"use client";

import { useEffect, useRef } from "react";
import { createSpring, stepSpring, subscribe, targetSpring, clamp } from "@/lib/motion/springs";

/**
 * Streaming Reply port, adapted to real data: the reply bubble opens from a
 * small pill and grows on a spring (260 26) instead of popping to full width.
 * The app receives typing state, not a token stream, so the shimmering label
 * shows who is typing — no invented words are displayed.
 */
export function StreamingTypingBubble({ names }: { names: string[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);
  const s = useRef({
    w: createSpring(0, [260, 26]),
    h: createSpring(0, [260, 26]),
    o: createSpring(0, "fade"),
    y: createSpring(0, "settle"),
  });
  const visible = names.length > 0;
  const text =
    names.length === 1
      ? `${names[0]} is typing`
      : names.length > 1
        ? `${names.slice(0, 2).join(" and ")}${names.length > 2 ? ` +${names.length - 2}` : ""} are typing`
        : "";

  useEffect(() => {
    return subscribe((dt) => {
      [s.current.w, s.current.h, s.current.o, s.current.y].forEach((spring) => stepSpring(spring, dt));
      const host = hostRef.current;
      if (!host) return;
      host.style.width = `${Math.max(0, s.current.w.x).toFixed(2)}px`;
      host.style.height = `${Math.max(0, s.current.h.x).toFixed(2)}px`;
      host.style.opacity = clamp(s.current.o.x, 0, 1).toFixed(3);
      host.style.transform = `translateY(${((1 - clamp(s.current.o.x, 0, 1)) * 8 + s.current.y.x).toFixed(2)}px)`;
    });
  }, []);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const measure = () => {
      if (!visible) return;
      targetSpring(s.current.w, content.scrollWidth + 28);
      targetSpring(s.current.h, content.scrollHeight + 16);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [visible, text]);

  useEffect(() => {
    targetSpring(s.current.o, visible ? 1 : 0);
    if (visible) {
      targetSpring(s.current.w, (contentRef.current?.scrollWidth ?? 90) + 28);
      targetSpring(s.current.h, (contentRef.current?.scrollHeight ?? 18) + 16);
    }
  }, [visible, text]);

  return (
    <div
      ref={hostRef}
      aria-live="polite"
      className="pointer-events-none overflow-hidden rounded-2xl rounded-bl-sm bg-ink-600 px-3.5 py-2 text-[11px] font-medium text-cream-300 will-change-transform"
      style={{ width: 0, height: 0, opacity: 0 }}
    >
      <span ref={contentRef} className="motion-shine inline-block whitespace-nowrap bg-[linear-gradient(90deg,#a09d99_20%,#e8e6e3_50%,#a09d99_80%)] bg-[length:200%_100%] bg-clip-text text-transparent">
        {text || "typing"}
      </span>
    </div>
  );
}
