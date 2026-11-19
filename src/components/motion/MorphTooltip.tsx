"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createSpring, stepSpring, subscribe, targetSpring, clamp } from "@/lib/motion/springs";

/**
 * Morph Tooltip port: instead of appearing fully formed, the tooltip springs
 * open to the measured content width, stretches across targets via stiff
 * leading / soft trailing edges when the trigger changes label, and its tail
 * follows on its own spring. Leaving waits briefly so gaps don't flicker.
 */
export function MorphTooltip({
  content,
  children,
  label,
}: {
  content: ReactNode;
  children: (props: {
    onPointerEnter: () => void;
    onPointerLeave: () => void;
    onFocus: () => void;
    onBlur: () => void;
  }) => ReactNode;
  label?: string;
}) {
  const [shown, setShown] = useState(false);
  const hostRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const tailRef = useRef<HTMLSpanElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);
  const width = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const s = useRef({
    lead: createSpring(0, "lead"),
    trail: createSpring(0, "trail"),
    tail: createSpring(0, "settle"),
    a: createSpring(0, "fade"),
  });
  const current = useRef(-1);

  useEffect(() => {
    return subscribe((dt) => {
      const st = s.current;
      [st.lead, st.trail, st.tail, st.a].forEach((spring) => stepSpring(spring, dt));
      const tip = tipRef.current;
      if (tip) {
        const left = Math.min(st.lead.x, st.trail.x - 40);
        const w = Math.max(40, st.trail.x - left);
        tip.style.width = `${w.toFixed(2)}px`;
        tip.style.opacity = clamp(st.a.x, 0, 1).toFixed(3);
        tip.style.transform = `translate(${left.toFixed(2)}px, ${((1 - clamp(st.a.x, 0, 1.1)) * 6).toFixed(2)}px) scale(${(0.72 + 0.28 * clamp(st.a.x, 0, 1)).toFixed(3)})`;
      }
      if (tailRef.current) {
        tailRef.current.style.opacity = clamp(st.a.x, 0, 1).toFixed(3);
        tailRef.current.style.transform = `translate(${(st.tail.x - 5).toFixed(2)}px, ${((1 - clamp(st.a.x, 0, 1)) * 8).toFixed(2)}px) rotate(45deg)`;
      }
    });
  }, []);

  const show = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setShown(true);
  };
  const hide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShown(false), 140);
  };

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const tip = tipRef.current;
    const body = contentRef.current;
    if (!host || !tip || !body) return;
    const measure = () => {
      width.current = Math.min(260, Math.max(90, body.scrollWidth + 4));
      if (shown) {
        const center = host.clientWidth / 2;
        targetSpring(s.current.lead, center - width.current / 2);
        targetSpring(s.current.trail, center + width.current / 2);
        targetSpring(s.current.tail, center);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, [content, shown]);

  useEffect(() => {
    const center = hostRef.current?.clientWidth ? hostRef.current.clientWidth / 2 : 11;
    const w = width.current || 120;
    if (shown) {
      // On first show the tooltip springs out of its own centre; on subsequent
      // content changes the two edges move at different rates and it stretches.
      const snap = current.current < 0;
      targetSpring(s.current.lead, center - w / 2, snap);
      targetSpring(s.current.trail, center + w / 2, snap);
      targetSpring(s.current.tail, center, snap);
      targetSpring(s.current.a, 1, snap);
      current.current = 1;
    } else {
      targetSpring(s.current.a, 0);
      current.current = -1;
    }
  }, [shown, content]);

  return (
    <span ref={hostRef} className="relative inline-flex" onPointerEnter={show} onPointerLeave={hide}>
      {children({ onPointerEnter: show, onPointerLeave: hide, onFocus: show, onBlur: hide })}
      <span
        ref={tipRef}
        role="tooltip"
        aria-label={label}
        aria-hidden={!shown}
        className="pointer-events-none absolute bottom-[calc(100%+10px)] left-0 z-50 block max-w-[260px] origin-bottom rounded-lg bg-cream-100 px-2.5 py-2 text-left text-[11px] leading-snug text-ink-900 shadow-xl will-change-transform"
        style={{ opacity: 0 }}
      >
        <span ref={contentRef} className="block w-max max-w-[240px]">
          {content}
        </span>
      </span>
      <span ref={tailRef} aria-hidden="true" className="pointer-events-none absolute bottom-[calc(100%+6px)] left-0 z-50 h-2.5 w-2.5 rounded-[3px] bg-cream-100" style={{ opacity: 0 }} />
    </span>
  );
}
