import { describe, it, expect } from "vitest";
import {
  parseClassification,
  extractJson,
  ClassificationValidationError,
} from "@/lib/ai/schema";
import { REACTION_CATEGORIES } from "@/shared/reactions";

describe("classification schema validation", () => {
  it("accepts a valid classification for every allowed category", () => {
    for (const category of REACTION_CATEGORIES) {
      const parsed = parseClassification({
        category,
        confidence: 0.9,
        reason: "test reason",
        language: "en",
      });
      expect(parsed.category).toBe(category);
    }
  });

  it("rejects unknown categories", () => {
    expect(() =>
      parseClassification({ category: "brilliant", confidence: 0.5, reason: "x", language: "en" })
    ).toThrow(ClassificationValidationError);
    expect(() =>
      parseClassification({ category: "greatt", confidence: 0.5, reason: "x", language: "en" })
    ).toThrow(ClassificationValidationError);
  });

  it("rejects out-of-range confidence values", () => {
    expect(() =>
      parseClassification({ category: "great", confidence: 1.5, reason: "x", language: "en" })
    ).toThrow();
    expect(() =>
      parseClassification({ category: "great", confidence: -0.1, reason: "x", language: "en" })
    ).toThrow();
    expect(() =>
      parseClassification({ category: "great", confidence: Number.NaN, reason: "x", language: "en" })
    ).toThrow();
  });

  it("rejects missing or malformed fields", () => {
    expect(() => parseClassification(null)).toThrow();
    expect(() => parseClassification({})).toThrow();
    expect(() =>
      parseClassification({ category: "great", reason: "x", language: "en" })
    ).toThrow();
    expect(() =>
      parseClassification({ category: "great", confidence: 0.5, reason: "", language: "en" })
    ).toThrow();
    expect(() =>
      parseClassification({ category: "great", confidence: 0.5, reason: "x", language: "english language" })
    ).toThrow();
  });

  it("accepts boundary confidence values 0 and 1", () => {
    expect(parseClassification({ category: "best", confidence: 0, reason: "x", language: "en" }).confidence).toBe(0);
    expect(parseClassification({ category: "best", confidence: 1, reason: "x", language: "ru" }).confidence).toBe(1);
  });
});

describe("extractJson", () => {
  it("parses plain JSON", () => {
    expect(extractJson('{"category":"great","confidence":0.9,"reason":"r","language":"en"}')).toEqual({
      category: "great",
      confidence: 0.9,
      reason: "r",
      language: "en",
    });
  });

  it("extracts JSON from markdown code fences", () => {
    const fenced = 'Here is the result:\n```json\n{"category":"blunder","confidence":0.97,"reason":"profanity","language":"en"}\n```';
    expect(extractJson(fenced)).toMatchObject({ category: "blunder" });
  });

  it("extracts JSON embedded in surrounding prose", () => {
    const prose = 'Sure! {"category":"miss","confidence":0.7,"reason":"off topic","language":"en"} done.';
    expect(extractJson(prose)).toMatchObject({ category: "miss" });
  });

  it("throws when there is no JSON at all", () => {
    expect(() => extractJson("no json here")).toThrow(ClassificationValidationError);
  });
});
