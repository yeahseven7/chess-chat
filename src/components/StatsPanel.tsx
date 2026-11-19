"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { REACTION_LIST } from "@/shared/reactions";
import { GlyphPath } from "./ReactionGlyph";
import { SpringExpand } from "./motion/SpringExpand";
import type { ConversationStats } from "@/lib/server/types";

interface StatsPanelProps {
  stats: ConversationStats | null;
  leftName: string;
  rightName: string;
  loading?: boolean;
}

/**
 * Reaction statistics panel — screenshot-style two-column layout.
 * Expansion uses the Expand Card springs: the panel height opens on a spring
 * and its rows cascade in instead of appearing all at once.
 */
export function StatsPanel({ stats, leftName, rightName, loading }: StatsPanelProps) {
  const [open, setOpen] = useState(true);

  return (
    <section aria-label="Reaction statistics" className="overflow-hidden rounded-xl border border-ink-500 bg-ink-700">
      <SpringExpand
        open={open}
        header={() => (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex w-full items-center justify-between px-4 py-2.5 text-left"
          >
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-cream-500">Reaction Review</span>
            {open ? (
              <ChevronUp size={16} className="text-cream-500" aria-hidden="true" />
            ) : (
              <ChevronDown size={16} className="text-cream-500" aria-hidden="true" />
            )}
          </button>
        )}
      >
        <div className="border-t border-ink-500 px-2 pb-3 pt-2">
          <div className="mb-1 grid grid-cols-[1fr_auto_auto_auto_1fr] items-center gap-3 px-2 text-[10px] font-semibold uppercase tracking-wide text-cream-600">
            <span className="truncate">{leftName}</span>
            <span />
            <span />
            <span />
            <span className="truncate text-right">{rightName}</span>
          </div>

          {loading && !stats ? (
            <div className="space-y-1.5 px-2 py-2" aria-busy="true">
              {REACTION_LIST.map((r) => (
                <div key={r.category} className="h-6 animate-pulse rounded bg-ink-600" />
              ))}
            </div>
          ) : (
            <div className="px-1">
              {REACTION_LIST.map((r) => {
                const mine = stats?.viewer[r.category] ?? 0;
                const peers = stats?.peer[r.category] ?? 0;
                return (
                  <div key={r.category} className="stats-row text-sm">
                    <span className="truncate font-medium text-cream-300">{r.label}</span>
                    <span className={`w-8 text-right tabular-nums ${mine > peers ? "font-bold text-cream-100" : "text-cream-500"}`}>{mine}</span>
                    <span className="flex h-6 w-6 items-center justify-center rounded-full text-white shadow-sm" style={{ background: r.color }} title={r.label}>
                      <svg width={13} height={13} viewBox="0 0 24 24" aria-hidden="true">
                        <GlyphPath glyph={r.glyph} />
                      </svg>
                    </span>
                    <span className={`w-8 tabular-nums ${peers > mine ? "font-bold text-cream-100" : "text-cream-500"}`}>{peers}</span>
                    <span />
                  </div>
                );
              })}
            </div>
          )}

          {stats && (
            <div className="mt-3 border-t border-ink-500 px-3 pt-2.5 text-[11px] text-cream-500">
              <div className="flex items-center justify-between">
                <span>Total analyzed</span>
                <span className="font-semibold tabular-nums text-cream-100" data-testid="stat-total">{stats.totalAnalyzed}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span>Positive / negative</span>
                <span className="tabular-nums">
                  <span className="text-accent">{stats.positive}</span> / <span className="text-[#ff9d8f]">{stats.negative}</span>
                </span>
              </div>
              {stats.mostCommon && (
                <div className="mt-1 flex items-center justify-between">
                  <span>Most common</span>
                  <span className="font-semibold capitalize text-cream-100">{stats.mostCommon}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </SpringExpand>
    </section>
  );
}
