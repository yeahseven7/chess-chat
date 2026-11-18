import type { AIProvider } from "./provider";
import { GeminiProvider } from "./gemini";
import { MockProvider } from "./mock";

/**
 * Resolve the configured provider. AI_PROVIDER=gemini (default) uses the real
 * Gemini API. AI_PROVIDER=mock uses the deterministic offline provider
 * (tests/CI only — never set mock in production).
 */
export function getAIProvider(): AIProvider {
  const choice = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();
  if (choice === "mock") return new MockProvider();
  if (choice === "gemini") {
    return new GeminiProvider(process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL);
  }
  // OpenAI-compatible / local providers can be registered here in the future
  // via AI_PROVIDER=openai + OPENAI_BASE_URL + OPENAI_API_KEY.
  throw new Error(`Unknown AI_PROVIDER: ${choice}`);
}
