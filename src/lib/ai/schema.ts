import { z } from "zod";
import { REACTION_CATEGORIES } from "@/shared/reactions";

/** Strict schema for every AI classification response. */
export const classificationSchema = z.object({
  category: z.enum(REACTION_CATEGORIES as unknown as [string, ...string[]]),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(500),
  language: z
    .string()
    .min(2)
    .max(35)
    .regex(/^[a-zA-Z-]+$/, "language must be a BCP-47-ish tag"),
});

export type Classification = z.infer<typeof classificationSchema> & {
  category: (typeof REACTION_CATEGORIES)[number];
};

/** Parse unknown model output into a validated Classification or throw. */
export function parseClassification(raw: unknown): Classification {
  const parsed = classificationSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ClassificationValidationError(
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    );
  }
  return parsed.data as Classification;
}

/** Attempt to extract JSON from raw model text (handles code fences / prose). */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      // fall through
    }
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) {
    return JSON.parse(trimmed.slice(first, last + 1));
  }
  throw new ClassificationValidationError("No JSON object found in model output");
}

export class ClassificationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClassificationValidationError";
  }
}
