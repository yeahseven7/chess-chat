import { describe, it, expect } from "vitest";
import { MockProvider } from "@/lib/ai/mock";

const provider = new MockProvider();

const classify = (message: string, context: Array<{ sender: string; content: string }> = []) =>
  provider.classify({ message, context, authorName: "author" });

describe("mock provider deterministic behavior", () => {
  it("classifies a friendly greeting as excellent", async () => {
    const r = await classify("Hello, how are you?");
    expect(r.category).toBe("excellent");
    expect(r.provider).toBe("mock");
  });

  it("classifies thank-you as best", async () => {
    expect((await classify("Thank you for helping me!")).category).toBe("best");
  });

  it("classifies genuinely interesting as great", async () => {
    expect((await classify("That's genuinely interesting.")).category).toBe("great");
  });

  it("classifies wrong arithmetic as mistake", async () => {
    const r = await classify("2 + 2 = 9");
    expect(r.category).toBe("mistake");
    expect(r.confidence).toBeGreaterThan(0.8);
  });

  it("accepts correct arithmetic (not mistake)", async () => {
    expect((await classify("2 + 2 = 4")).category).not.toBe("mistake");
  });

  it("classifies an off-topic reply to a question as miss", async () => {
    const r = await classify("the weather is nice", [
      { sender: "other", content: "What do you want to eat for lunch?" },
    ]);
    // Only the mock's off-topic patterns trigger miss
    expect(r.category).toBe("miss");
  });

  it("classifies English profanity as blunder", async () => {
    expect((await classify("What the hell is this?")).category).toBe("blunder");
    expect((await classify("this is fucking broken")).category).toBe("blunder");
  });

  it("classifies Russian profanity as blunder", async () => {
    expect((await classify("что за блядь")).category).toBe("blunder");
    expect((await classify("это пиздец")).category).toBe("blunder");
  });

  it("classifies Kazakh-specific Cyrillic text with kk language tag", async () => {
    const r = await classify("сәлеметсіз бе");
    expect(r.language).toBe("kk");
  });

  it("detects Russian language for ordinary Russian text", async () => {
    expect((await classify("привет, как дела")).language).toBe("ru");
  });

  it("falls back to excellent with low confidence on unknown input", async () => {
    const r = await classify("zxcvbnm asdfgh");
    expect(r.category).toBe("excellent");
    expect(r.confidence).toBeLessThanOrEqual(0.6);
  });

  it("returns the six-category contract with a valid confidence", async () => {
    const r = await classify("Hello, how are you?");
    expect(["great", "best", "excellent", "mistake", "miss", "blunder"]).toContain(r.category);
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
    expect(r.reason.length).toBeGreaterThan(0);
  });
});
