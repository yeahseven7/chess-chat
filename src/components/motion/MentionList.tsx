"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { ProfileRow } from "@/lib/server/types";
import { Avatar } from "@/components/Avatar";
import {
  createSpring,
  stepSpring,
  subscribe,
  targetSpring,
  tuneSpring,
  clamp,
} from "@/lib/motion/springs";

const ROW = 42;

/**
 * Mention Picker port: the menu height, each row's slot/opacity and the
 * highlight's leading/trailing edges are springs, so rows that stop matching
 * fold away while the rest close up and the highlight stretches between them.
 * Parents own the composer text and keyboard handling; this component owns
 * only the animated list.
 */
export function MentionList({
  candidates,
  activeIndex,
  onPick,
}: {
  candidates: ProfileRow[];
  activeIndex: number;
  onPick: (profile: ProfileRow) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const hlRef = useRef<HTMLSpanElement>(null);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const s = useRef({
    h: createSpring(0, "soft"),
    o: createSpring(0, "fade"),
    hlA: createSpring(4, "lead"),
    hlB: createSpring(4 + ROW, "lead"),
    rows: candidates.map(() => ({
      y: createSpring(0, "soft"),
      o: createSpring(0, "fade"),
    })),
  });
  const previous = useRef<number>(-1);

  useEffect(() => {
    s.current.rows = candidates.map(() => ({
      y: createSpring(0, "soft"),
      o: createSpring(0, "fade"),
    }));
  }, [candidates.length, candidates]);

  useEffect(() => {
    return subscribe((dt) => {
      const st = s.current;
      [st.h, st.o, st.hlA, st.hlB].forEach((spring) => stepSpring(spring, dt));
      st.rows.forEach((row) => {
        stepSpring(row.y, dt);
        stepSpring(row.o, dt);
      });
      const menu = menuRef.current;
      if (menu) {
        menu.style.height = `${Math.max(0, st.h.x).toFixed(2)}px`;
        menu.style.opacity = clamp(st.o.x, 0, 1).toFixed(3);
        menu.style.transform = `translateY(${((1 - clamp(st.o.x, 0, 1)) * -6).toFixed(2)}px)`;
      }
      if (hlRef.current) {
        const top = Math.min(st.hlA.x, st.hlB.x);
        hlRef.current.style.transform = `translateY(${top.toFixed(2)}px)`;
        hlRef.current.style.height = `${Math.max(ROW, Math.abs(st.hlB.x - st.hlA.x) + ROW).toFixed(2)}px`;
      }
      rowRefs.current.forEach((row, i) => {
        const rs = st.rows[i];
        if (!row || !rs) return;
        row.style.opacity = clamp(rs.o.x, 0, 1).toFixed(3);
        row.style.transform = `translateY(${rs.y.x.toFixed(2)}px) scale(${(0.94 + 0.06 * clamp(rs.o.x, 0, 1)).toFixed(3)})`;
        row.style.visibility = rs.o.x < 0.01 ? "hidden" : "visible";
      });
    });
  }, [candidates.length, candidates]);

  useEffect(() => {
    const st = s.current;
    const opening = st.h.t === 0;
    targetSpring(st.h, 8 + candidates.length * ROW);
    targetSpring(st.o, 1);
    const down = activeIndex >= previous.current;
    tuneSpring(st.hlA, down ? "trail" : "lead");
    tuneSpring(st.hlB, down ? "lead" : "trail");
    targetSpring(st.hlA, 4 + activeIndex * ROW);
    targetSpring(st.hlB, 4 + activeIndex * ROW + ROW);
    previous.current = activeIndex;
    st.rows.forEach((row, i) => {
      const y = 4 + i * ROW;
      if (opening) row.y.x = y - 8; // rows rise into place on first open
      targetSpring(row.y, y);
      targetSpring(row.o, i < candidates.length ? 1 : 0);
    });
  }, [candidates.length, activeIndex, candidates]);

  if (!candidates.length) return null;

  return (
    <div
      ref={menuRef}
      className="absolute bottom-full left-0 z-30 mb-2 w-64 overflow-hidden rounded-xl border border-ink-500 bg-ink-700 p-1.5 shadow-2xl will-change-transform"
      style={{ height: 0, opacity: 0 }}
      role="listbox"
      aria-label="Mention someone"
    >
      <span ref={hlRef} aria-hidden="true" className="pointer-events-none absolute left-1.5 right-1.5 top-0 rounded-lg bg-ink-600" />
      {candidates.map((person, i) => (
        <button
          key={person.id}
          ref={(node) => {
            rowRefs.current[i] = node;
          }}
          type="button"
          role="option"
          aria-selected={i === activeIndex}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(person)}
          className="absolute left-1.5 right-1.5 top-0 flex h-[42px] w-[calc(100%-12px)] items-center gap-2.5 rounded-lg px-2 text-left text-sm text-cream-100 will-change-transform"
        >
          <Avatar name={person.displayName} color={person.avatarColor} url={person.avatarUrl} size={24} />
          <span className="font-medium">{person.displayName}</span>
          <span className="ml-auto text-xs text-cream-500">@{person.username}</span>
        </button>
      ))}
    </div>
  );
}

export type MentionChildProps = {
  /** Feed to the textarea's onKeyDown; returns true when the key was consumed. */
  handleMentionKey: (event: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
};

export function mentionQuery(text: string): { query: string; start: number } | null {
  const match = text.match(/@([A-Za-z0-9_]*)$/);
  if (!match) return null;
  return { query: match[1] ?? "", start: text.length - match[0].length };
}

export function applyMention(text: string, profile: ProfileRow): string {
  const found = mentionQuery(text);
  if (!found) return text;
  return `${text.slice(0, found.start)}@${profile.displayName} `;
}

export type { ReactNode };
