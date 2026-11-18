/**
 * Shared reaction category definitions — the six chess-review style symbols.
 * Used by both server (validation, analysis pipeline, stats) and client (icons, colors).
 */

export const REACTION_CATEGORIES = [
  "great",
  "best",
  "excellent",
  "mistake",
  "miss",
  "blunder",
] as const;

export type ReactionCategory = (typeof REACTION_CATEGORIES)[number];

export const ANALYSIS_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
] as const;

export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export interface ReactionMeta {
  category: ReactionCategory;
  label: string;
  /** Short glyph rendered on the circular badge (custom SVG paths, not emoji). */
  glyph: string;
  /** Circle background color. */
  color: string;
  /** Slightly darker rim/hover color. */
  dark: string;
  /** Positive = constructive/good, negative = problematic. */
  polarity: "positive" | "negative";
  /** One-line description shown in tooltips. */
  blurb: string;
}

export const REACTIONS: Record<ReactionCategory, ReactionMeta> = {
  great: {
    category: "great",
    label: "Great",
    glyph: "!",
    color: "#3fa9f5",
    dark: "#2b84c4",
    polarity: "positive",
    blurb: "Interesting, impressive or noteworthy",
  },
  best: {
    category: "best",
    label: "Best",
    glyph: "star",
    color: "#3d9a4e",
    dark: "#2c7539",
    polarity: "positive",
    blurb: "Exceptionally helpful, thoughtful or supportive",
  },
  excellent: {
    category: "excellent",
    label: "Excellent",
    glyph: "thumb",
    color: "#81b64c",
    dark: "#61873a",
    polarity: "positive",
    blurb: "Good, positive and constructive",
  },
  mistake: {
    category: "mistake",
    label: "Mistake",
    glyph: "?",
    color: "#e8a33d",
    dark: "#bd7f22",
    polarity: "negative",
    blurb: "Incorrect or questionable information",
  },
  miss: {
    category: "miss",
    label: "Miss",
    glyph: "x",
    color: "#e0704f",
    dark: "#b04e31",
    polarity: "negative",
    blurb: "Misses the point of the conversation",
  },
  blunder: {
    category: "blunder",
    label: "Blunder",
    glyph: "??",
    color: "#d0342c",
    dark: "#a0241d",
    polarity: "negative",
    blurb: "Profanity, insults or offensive language",
  },
};

export const REACTION_LIST: ReactionMeta[] = REACTION_CATEGORIES.map(
  (c) => REACTIONS[c]
);
