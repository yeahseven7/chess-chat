"use client";

import { useState } from "react";
import { REACTIONS, type ReactionCategory } from "@/shared/reactions";
import { GlyphPath } from "./ReactionGlyph";

interface ReactionBadgeProps {
  category: ReactionCategory;
  confidence: number;
  reason?: string;
  createdAt?: string;
  size?: number;
}

/** Circular reaction badge with hover/click tooltip. */
export function ReactionBadge({ category, confidence, reason, createdAt, size = 22 }: ReactionBadgeProps) {
  const [open, setOpen] = useState(false);
  const meta = REACTIONS[category];

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={`${meta.label}: ${meta.blurb}. Confidence ${Math.round(confidence * 100)} percent.`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        className="reaction-pop inline-flex cursor-pointer items-center justify-center rounded-full text-white shadow-sm transition-transform hover:scale-110 focus-visible:scale-110"
        style={{ width: size, height: size, background: meta.color }}
      >
        <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" aria-hidden="true">
          <GlyphPath glyph={meta.glyph} />
        </svg>
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 z-50 mt-2 w-56 -translate-x-1/2 rounded-lg border border-ink-500 bg-ink-900 p-2.5 text-left shadow-xl"
          style={{ top: "100%" }}
        >
          <span className="flex items-center gap-2">
            <span
              className="inline-flex items-center justify-center rounded-full text-white"
              style={{ width: 20, height: 20, background: meta.color }}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" aria-hidden="true">
                <GlyphPath glyph={meta.glyph} />
              </svg>
            </span>
            <span className="text-sm font-semibold text-cream-100">{meta.label}</span>
            <span className="ml-auto text-[10px] uppercase tracking-wide text-cream-500">
              {Math.round(confidence * 100)}%
            </span>
          </span>
          {reason && <span className="mt-1.5 block text-xs leading-snug text-cream-300">{reason}</span>}
          <span className="mt-1.5 block text-[10px] text-cream-600">{meta.blurb}</span>
          {createdAt && (
            <span className="mt-0.5 block text-[10px] text-cream-600">
              Analyzed {new Date(createdAt).toLocaleString()}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
