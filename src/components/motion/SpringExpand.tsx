"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createSpring, stepSpring, subscribe, targetSpring, after, clamp } from "@/lib/motion/springs";

/**
 * Expand Card port, generalized: one progress spring drives panel height and
 * header motion, while children fade/rise in one after another (45ms stagger)
 * as it opens. Uses the reference's 260 24 / 260 28 springs.
 */
export function SpringExpand({
  open,
  header,
  children,
  contentClassName = "",
}: {
  open: boolean;
  header: (props: { open: boolean }) => ReactNode;
  children: ReactNode;
  contentClassName?: string;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const measured = useRef(0);
  const s = useRef({
    h: createSpring(0, "soft"),
    o: createSpring(0, "fade"),
    rows: [] as ReturnType<typeof createSpring>[],
  });

  useEffect(() => {
    const content = contentRef.current;
    const inner = innerRef.current;
    if (!content || !inner) return;
    const measure = () => {
      measured.current = inner.scrollHeight;
      if (open) targetSpring(s.current.h, measured.current);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [open, children]);

  useEffect(() => {
    const rows = innerRef.current?.children.length ?? 0;
    s.current.rows = Array.from({ length: rows }, () => createSpring(0, [260, 28]));
    const cancels: Array<() => void> = [];
    targetSpring(s.current.h, open ? measured.current : 0);
    targetSpring(s.current.o, open ? 1 : 0);
    s.current.rows.forEach((spring, i) => {
      if (open) cancels.push(after(0.08 + i * 0.045, () => targetSpring(spring, 1)));
      else targetSpring(spring, 0);
    });
    return () => cancels.forEach((cancel) => cancel());
  }, [open, children]);

  useEffect(() => {
    return subscribe((dt) => {
      const st = s.current;
      [st.h, st.o, ...st.rows].forEach((spring) => stepSpring(spring, dt));
      const content = contentRef.current;
      if (content) {
        content.style.height = `${Math.max(0, st.h.x).toFixed(2)}px`;
        content.style.opacity = clamp(st.o.x, 0, 1).toFixed(3);
        content.style.visibility = st.h.x < 1 ? "hidden" : "visible";
      }
      const inner = innerRef.current;
      if (inner) {
        Array.from(inner.children).forEach((child, i) => {
          const spring = st.rows[i];
          if (!spring || !(child instanceof HTMLElement)) return;
          child.style.opacity = clamp(spring.x, 0, 1).toFixed(3);
          child.style.transform = `translateY(${((1 - clamp(spring.x, 0, 1)) * 10).toFixed(2)}px)`;
        });
      }
    });
  }, []);

  return (
    <>
      {header({ open })}
      <div ref={contentRef} className={`overflow-hidden ${contentClassName}`} style={{ height: 0, opacity: 0 }}>
        <div ref={innerRef}>{children}</div>
      </div>
    </>
  );
}
