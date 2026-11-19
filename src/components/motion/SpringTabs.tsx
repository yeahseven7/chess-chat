"use client";

import { useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import {
  createSpring,
  prefersReducedMotion,
  stepSpring,
  subscribe,
  targetSpring,
  tuneSpring,
} from "@/lib/motion/springs";

export interface SpringTabItem<T extends string> {
  id: T;
  label: string;
  icon?: LucideIcon;
  badge?: number;
}

/**
 * Tab pill port: two springs per pill (leading and trailing edge). The edge
 * facing the direction of travel is stiff (620 40), the other lags (170 19),
 * so the pill stretches toward the new tab and pulls its tail in.
 */
export function SpringTabs<T extends string>({
  items,
  value,
  onChange,
  label = "Sections",
}: {
  items: Array<SpringTabItem<T>>;
  value: T;
  onChange: (id: T) => void;
  label?: string;
}) {
  const pillRef = useRef<HTMLSpanElement>(null);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const springs = useRef({
    a: createSpring(0, "tabLead"),
    b: createSpring(0, "tabTrail"),
  });
  const previous = useRef(-1);

  useEffect(() => {
    return subscribe((dt) => {
      stepSpring(springs.current.a, dt);
      stepSpring(springs.current.b, dt);
      const pill = pillRef.current;
      if (pill) {
        pill.style.transform = `translateX(${springs.current.a.x.toFixed(2)}px)`;
        pill.style.width = Math.max(0, springs.current.b.x - springs.current.a.x).toFixed(2) + "px";
      }
    });
  }, []);

  useEffect(() => {
    const index = Math.max(0, items.findIndex((item) => item.id === value));
    const el = buttons.current[index];
    if (!el) return;
    const down = index >= previous.current;
    tuneSpring(springs.current.a, down ? "tabTrail" : "tabLead");
    tuneSpring(springs.current.b, down ? "tabLead" : "tabTrail");
    const snap = previous.current < 0 || prefersReducedMotion();
    targetSpring(springs.current.a, el.offsetLeft, snap);
    targetSpring(springs.current.b, el.offsetLeft + el.offsetWidth, snap);
    previous.current = index;
  }, [value, items]);

  // Keep the pill aligned when the sidebar width or font metrics change.
  useEffect(() => {
    const onResize = () => {
      const index = Math.max(0, items.findIndex((item) => item.id === value));
      const el = buttons.current[index];
      if (!el) return;
      targetSpring(springs.current.a, el.offsetLeft, true);
      targetSpring(springs.current.b, el.offsetLeft + el.offsetWidth, true);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [items, value]);

  return (
    <div role="tablist" aria-label={label} className="relative flex border-b border-ink-500 text-xs font-semibold">
      <span
        ref={pillRef}
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 top-0 rounded-t-md bg-ink-500 will-change-transform"
      />
      {items.map((item, i) => {
        const Icon = item.icon;
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(node) => {
              buttons.current[i] = node;
            }}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.id)}
            className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 transition-colors ${
              selected ? "text-accent" : "text-cream-500 hover:text-cream-100"
            }`}
          >
            {Icon && <Icon size={15} aria-hidden="true" />}
            <span data-collapsible-label style={{ "--label-index": 4 + i } as React.CSSProperties} className="inline-flex items-center gap-1.5">
              {item.label}
              {!!item.badge && item.badge > 0 && (
                <span className="rounded-full bg-accent px-1.5 text-[9px] font-bold text-[#1b1917]">
                  {item.badge}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
