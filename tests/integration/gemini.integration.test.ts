/**
 * Live Gemini integration tests. These call the real Google Gemini API with
 * synthetic, non-sensitive messages. They are skipped entirely when
 * GEMINI_API_KEY is not configured, so CI and local unit runs never depend
 * on the network or on Gemini availability.
 */
import { describe, it, expect } from "vitest";
import { GeminiProvider } from "@/lib/ai/gemini";

const apiKey = process.env.GEMINI_API_KEY;
const run = apiKey ? describe : describe.skip;

run("Gemini provider (live API)", () => {
  const provider = new GeminiProvider(apiKey, process.env.GEMINI_MODEL);

  it("classifies a friendly greeting as a positive category", async () => {
    const r = await provider.classify({
      message: "Hello! How are you doing today?",
      context: [],
      authorName: "tester",
    });
    expect(["best", "great", "excellent"]).toContain(r.category);
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
    expect(r.reason.length).toBeGreaterThan(0);
  });

  it("classifies English profanity as blunder", async () => {
    const r = await provider.classify({
      message: "What the fuck is wrong with you, you absolute bastard?",
      context: [],
      authorName: "tester",
    });
    expect(r.category).toBe("blunder");
  });

  it("classifies Russian profanity as blunder", async () => {
    const r = await provider.classify({
      message: "Что за хуйня, нахуй ты это написал?",
      context: [],
      authorName: "tester",
    });
    expect(r.category).toBe("blunder");
  });

  it("classifies an incorrect statement as a mistake (not a blunder)", async () => {
    const r = await provider.classify({
      message: "Actually, the capital of France is London, not Paris.",
      context: [{ sender: "other", content: "Which city is the capital of France?" }],
      authorName: "tester",
    });
    expect(r.category).toBe("mistake");
  });

  it("returns a structured response with a BCP-47-like language tag", async () => {
    const r = await provider.classify({
      message: "Thanks for the help!",
      context: [],
      authorName: "tester",
    });
    expect(typeof r.language).toBe("string");
    expect(r.language).toMatch(/^[a-zA-Z-]+$/);
    expect(r.provider).toBe("gemini");
    expect(r.model.length).toBeGreaterThan(0);
  });
});
