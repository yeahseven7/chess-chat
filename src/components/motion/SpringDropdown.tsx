"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  createSpring,
  stepSpring,
  subscribe,
  targetSpring,
  tuneSpring,
  after,
  prefersReducedMotion,
} from "@/lib/motion/springs";

export interface SpringDropdownOption {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
}

/**
 * Spring Dropdown port: menu height spring (300 23) with the whole control
 * lifting to stay centred, staggered rows, a highlight with stiff lead / soft
 * trail edges, and a drawn check on the selected option.
 */
export function SpringDropdown({
  options,
  label = "Options",
  selectedId,
  className = "",
}: {
  options: SpringDropdownOption[];
  label?: string;
  selectedId?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hlRef = useRef<HTMLSpanElement>(null);
  const chevronRef = useRef<HTMLSpanElement>(null);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const tickRefs = useRef<Array<SVGPathElement | null>>([]);

  const ROW = 40;
  const PAD = 6;
  const GAP = 6;
  const menuHeight = PAD * 2 + ROW * options.length;

  const s = useRef({
    h: createSpring(0, "dropdownHeight"),
    y: createSpring(0, "settle"),
    o: createSpring(0, "fade"),
    chevron: createSpring(0, "settle"),
    ht: createSpring(PAD, "lead"),
    hb: createSpring(PAD + ROW, "lead"),
    ho: createSpring(0, "fade"),
    rows: options.map(() => createSpring(0, "settle")),
    checks: options.map(() => createSpring(0, "settle")),
  });
  const hovered = useRef(-1);
  const active = useRef(-1);

  useEffect(() => {
    s.current.rows = options.map(() => createSpring(0, "settle"));
    s.current.checks = options.map(() => createSpring(0, "settle"));
    options.forEach((o, i) => targetSpring(s.current.checks[i]!, o.id === selectedId ? 1 : 0, true));
  }, [options, selectedId]);

  useEffect(() => {
    s.current.checks.forEach((spring, i) =>
      targetSpring(spring, options[i]?.id === selectedId ? 1 : 0)
    );
  }, [selectedId, options]);

  useEffect(() => {
    return subscribe((dt) => {
      const st = s.current;
      [st.h, st.y, st.o, st.chevron, st.ht, st.hb, st.ho, ...st.rows, ...st.checks].forEach(
        (spring) => stepSpring(spring, dt)
      );
      const menu = menuRef.current;
      if (menu) {
        const h = Math.max(0, st.h.x);
        menu.style.height = `${h.toFixed(2)}px`;
        menu.style.opacity = Math.max(0, Math.min(1, st.o.x)).toFixed(3);
        menu.style.visibility = h < 1 ? "hidden" : "visible";
        menu.style.pointerEvents = open ? "auto" : "none";
        menu.style.transform = `scaleX(${(0.94 + 0.06 * Math.min(st.h.x / menuHeight, 1)).toFixed(4)})`;
      }
      if (rootRef.current) rootRef.current.style.transform = `translateY(${st.y.x.toFixed(2)}px)`;
      if (chevronRef.current) chevronRef.current.style.transform = `rotate(${(180 * st.chevron.x).toFixed(2)}deg)`;
      if (hlRef.current) {
        const top = Math.min(st.ht.x, st.hb.x - 16);
        hlRef.current.style.transform = `translateY(${top.toFixed(2)}px)`;
        hlRef.current.style.height = `${Math.max(16, st.hb.x - top).toFixed(2)}px`;
        hlRef.current.style.opacity = (Math.min(1, Math.max(0, st.ho.x)) * Math.min(1, Math.max(0, st.o.x))).toFixed(3);
      }
      rowRefs.current.forEach((row, i) => {
        const spring = st.rows[i];
        if (!row || !spring) return;
        row.style.opacity = Math.min(1, Math.max(0, spring.x)).toFixed(3);
        row.style.transform = `translateY(${((spring.x - 1) * 10).toFixed(2)}px)`;
      });
      tickRefs.current.forEach((path, i) => {
        const spring = st.checks[i];
        if (path && spring) path.style.strokeDashoffset = `${22 * (1 - Math.min(1, Math.max(0, spring.x)))}`;
      });
    });
  }, [open, options.length, menuHeight]);

  useEffect(() => {
    const st = s.current;
    targetSpring(st.h, open ? menuHeight : 0);
    targetSpring(st.y, open ? -(GAP + menuHeight) / 2 : 0);
    targetSpring(st.chevron, open ? 1 : 0);
    targetSpring(st.o, open ? 1 : 0);
    const n = options.length;
    const cancels: Array<() => void> = [];
    options.forEach((_, i) => {
      cancels.push(
        after(open ? 0.04 + i * 0.045 : (n - 1 - i) * 0.02, () => {
          targetSpring(st.rows[i]!, open ? 1 : 0);
        })
      );
    });
    if (open) {
      hovered.current = Math.max(0, options.findIndex((o) => o.id === selectedId));
      active.current = hovered.current;
      targetSpring(st.ht, PAD + hovered.current * ROW, true);
      targetSpring(st.hb, PAD + hovered.current * ROW + ROW, true);
      targetSpring(st.ho, 1);
    } else {
      hovered.current = -1;
      active.current = -1;
      targetSpring(st.ho, 0);
    }
    return () => cancels.forEach((cancel) => cancel());
  }, [open, menuHeight, options, selectedId]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const hover = (i: number) => {
    if (i === hovered.current || i < 0 || i >= options.length) return;
    const down = i > hovered.current;
    tuneSpring(s.current.ht, down ? "dropdownTrail" : "lead");
    tuneSpring(s.current.hb, down ? "lead" : "dropdownTrail");
    targetSpring(s.current.ht, PAD + i * ROW);
    targetSpring(s.current.hb, PAD + i * ROW + ROW);
    targetSpring(s.current.ho, 1);
    hovered.current = i;
    active.current = i;
  };

  const choose = (i: number) => {
    options[i]?.onSelect();
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setOpen(true);
          } else if (open && e.key === "ArrowDown") {
            e.preventDefault();
            hover(active.current + 1 >= options.length ? 0 : active.current + 1);
          } else if (open && e.key === "ArrowUp") {
            e.preventDefault();
            hover(active.current - 1 < 0 ? options.length - 1 : active.current - 1);
          } else if (open && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            choose(active.current < 0 ? 0 : active.current);
          }
        }}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-ink-500 bg-ink-700 text-cream-500 transition-colors hover:border-cream-600 hover:text-cream-100"
      >
        <span ref={chevronRef} className="inline-flex">
          <ChevronDown size={17} aria-hidden="true" />
        </span>
      </button>
      <div
        ref={menuRef}
        role="menu"
        aria-label={label}
        className="absolute left-0 top-full z-30 mt-1.5 w-52 origin-top overflow-hidden rounded-xl border border-ink-500 bg-ink-700 p-1.5 shadow-xl will-change-transform"
        style={{ height: 0, visibility: "hidden" }}
      >
        <span ref={hlRef} aria-hidden="true" className="pointer-events-none absolute left-1.5 right-1.5 top-0 rounded-lg bg-ink-600" />
        {options.map((option, i) => (
          <button
            key={option.id}
            ref={(node) => {
              rowRefs.current[i] = node;
            }}
            type="button"
            role="menuitem"
            onClick={() => choose(i)}
            onPointerEnter={() => hover(i)}
            onFocus={() => hover(i)}
            className="relative z-10 flex h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm text-cream-100 will-change-transform"
          >
            <span className="text-cream-500">{option.icon}</span>
            <span className="flex-1">{option.label}</span>
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path
                ref={(node) => {
                  tickRefs.current[i] = node;
                }}
                d="M5 12.5l4.5 4.5L19 7.5"
                style={{ strokeDasharray: 22, strokeDashoffset: 22 }}
              />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}
