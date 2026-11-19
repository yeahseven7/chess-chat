"use client";

import { useEffect, useRef } from "react";
import { createSpring, stepSpring, subscribe, targetSpring, after, clamp } from "@/lib/motion/springs";

interface RollingWord {
  id: number;
  text: string;
  letters: Array<{ el: HTMLSpanElement | null; s: ReturnType<typeof createSpring> }>;
  el: HTMLSpanElement | null;
  out: boolean;
}

let nextId = 0;

/**
 * Word Roll port: each letter rolls up/out (420 26) while the next word's
 * letters roll in from below, staggered, and the slot width springs (320 30)
 * to the new name. Used for the active conversation title.
 */
export function WordRoll({ text, className = "" }: { text: string; className?: string }) {
  const slotRef = useRef<HTMLSpanElement>(null);
  const live = useRef<RollingWord[]>([]);
  const width = useRef(createSpring(0, [320, 30]));
  const first = useRef(true);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    const unsub = subscribe((dt) => {
      stepSpring(width.current, dt);
      slot.style.width = `${Math.max(0, width.current.x).toFixed(2)}px`;
      live.current.forEach((word) =>
        word.letters.forEach((letter) => {
          stepSpring(letter.s, dt);
          if (!letter.el) return;
          const y = letter.s.x;
          letter.el.style.transform = `translateY(${clamp(y, -1.2, 1.2) * 105}%)`;
          letter.el.style.opacity = clamp(1 - Math.abs(y) * 0.9, 0, 1).toFixed(3);
        })
      );
    });
    return unsub;
  }, []);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot || !text) return;
    const cancels: Array<() => void> = [];
    const snap = first.current;
    first.current = false;

    live.current.forEach((word) => {
      if (word.out) return;
      word.out = true;
      word.letters.forEach((letter, i) => {
        cancels.push(after(i * 0.022, () => targetSpring(letter.s, -1)));
      });
      cancels.push(
        after(0.9, () => {
          word.el?.remove();
          live.current = live.current.filter((w) => w !== word);
        })
      );
    });

    const el = document.createElement("span");
    el.className = "inline-flex whitespace-pre";
    const letters = [...text].map((ch) => {
      const node = document.createElement("span");
      node.className = "inline-block will-change-transform";
      node.textContent = ch;
      el.appendChild(node);
      const spring = createSpring(1, [420, 26]);
      if (snap) {
        spring.x = 0;
        spring.t = 0;
      } else {
        cancels.push(after(0.06, () => targetSpring(spring, 0)));
      }
      return { el: node, s: spring };
    });
    slot.appendChild(el);
    const word: RollingWord = { id: nextId++, text, letters, el, out: false };
    live.current.push(word);
    width.current.t = el.offsetWidth;
    if (snap) width.current.x = width.current.t;
    return () => cancels.forEach((cancel) => cancel());
  }, [text]);

  return (
    <span className={`relative inline-flex items-center overflow-hidden ${className}`} aria-label={text}>
      <span className="sr-only">{text}</span>
      <span ref={slotRef} className="relative block h-[1.25em] overflow-hidden will-change-[width]" aria-hidden="true" />
    </span>
  );
}
