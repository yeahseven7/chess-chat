"use client";

import { REACTIONS, type ReactionCategory } from "@/shared/reactions";
import { GlyphPath } from "./ReactionGlyph";
import { MorphTooltip } from "./motion/MorphTooltip";

interface ReactionBadgeProps {
  category: ReactionCategory;
  confidence: number;
  reason?: string;
  createdAt?: string;
  size?: number;
}

/** Circular AI reaction badge with a morphing tooltip that stretches to fit its explanation. */
export function ReactionBadge({ category, confidence, reason, createdAt, size = 22 }: ReactionBadgeProps) {
  const meta = REACTIONS[category];
  const aria = `${meta.label}: ${meta.blurb}. Confidence ${Math.round(confidence * 100)} percent.`;

  return (
    <MorphTooltip
      label={aria}
      content={
        <span className="block">
          <span className="flex items-center gap-2">
            <span
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white"
              style={{ background: meta.color }}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" aria-hidden="true">
                <GlyphPath glyph={meta.glyph} />
              </svg>
            </span>
            <span className="font-semibold">{meta.label}</span>
            <span className="ml-auto uppercase tracking-wide text-ink-900/60">
              {Math.round(confidence * 100)}%
            </span>
          </span>
          {reason && <span className="mt-1 block text-ink-900/80">{reason}</span>}
          <span className="mt-0.5 block text-ink-900/55">{meta.blurb}</span>
          {createdAt && (
            <span className="mt-0.5 block text-ink-900/50">
              Analyzed {new Date(createdAt).toLocaleString()}
            </span>
          )}
        </span>
      }
    >
      {(tipProps) => (
        <button
          type="button"
          aria-label={aria}
          onClick={() => undefined}
          className="reaction-pop inline-flex cursor-pointer items-center justify-center rounded-full text-white shadow-sm transition-transform hover:scale-110 focus-visible:scale-110"
          style={{ width: size, height: size, background: meta.color }}
          {...tipProps}
        >
          <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" aria-hidden="true">
            <GlyphPath glyph={meta.glyph} />
          </svg>
        </button>
      )}
    </MorphTooltip>
  );
}
