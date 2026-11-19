import { describe, it, expect } from "vitest";
import {
  parseMockDirective,
  stripMockDirective,
  MockProvider,
} from "@/lib/ai/mock";
import { ProviderError, isRetryableError, parseRetryAfter } from "@/lib/ai/errors";
import { ClassificationValidationError } from "@/lib/ai/schema";

describe("mock directive parsing", () => {
  it("parses delay and fail directives", () => {
    expect(parseMockDirective("[[delay:1500]] some message").delayMs).toBe(1500);
    expect(parseMockDirective("[[fail:429]] rate limited").fail).toBe("429");
    expect(parseMockDirective("[[delay:2500]] [[fail:500]] both").fail).toBeUndefined();
    expect(parseMockDirective("plain message").delayMs).toBeUndefined();
  });

  it("caps delay at 30 seconds", () => {
    expect(parseMockDirective("[[delay:999999]] x").delayMs).toBe(30_000);
  });

  it("strips directives from the visible text", () => {
    expect(stripMockDirective("[[delay:1000]] hello world")).toBe("hello world");
    expect(stripMockDirective("[[fail:500]] boom")).toBe("boom");
    expect(stripMockDirective("no directive")).toBe("no directive");
    expect(stripMockDirective("[[delay:1000]] [[fail:429]] both")).toBe("both");
  });
});

describe("retryable classification", () => {
  it("treats 429/5xx as retryable with correct status", () => {
    for (const status of [429, 500, 502, 503, 504]) {
      const err = new ProviderError("boom", { retryable: true, status });
      expect(isRetryableError(err)).toBe(true);
    }
  });

  it("treats validation errors as permanent", () => {
    expect(isRetryableError(new ClassificationValidationError("bad"))).toBe(false);
  });

  it("treats non-ProviderError errors as retryable (transient by default)", () => {
    expect(isRetryableError(new Error("random"))).toBe(true);
  });
});

describe("parseRetryAfter", () => {
  it("parses seconds", () => {
    expect(parseRetryAfter("120")).toBe(120_000);
    expect(parseRetryAfter("0")).toBe(0);
  });

  it("parses HTTP dates", () => {
    const future = new Date(Date.now() + 5_000).toUTCString();
    const ms = parseRetryAfter(future);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(5_000);
  });

  it("returns null for garbage input", () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("not-a-number-or-date")).toBeNull();
  });
});

describe("mock provider error directives", () => {
  const provider = new MockProvider();

  it("throws a retryable ProviderError for 429 with retry-after", async () => {
    try {
      await provider.classify({
        message: "[[fail:429]] rate limited",
        context: [],
        authorName: "tester",
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).status).toBe(429);
      expect(isRetryableError(error)).toBe(true);
      expect((error as ProviderError).retryAfterMs).toBe(1500);
    }
  });

  it("delays classification when delay directive is set", async () => {
    const start = performance.now();
    await provider.classify({ message: "[[delay:300]] slow message", context: [], authorName: "t" });
    expect(performance.now() - start).toBeGreaterThanOrEqual(290);
  });
});
