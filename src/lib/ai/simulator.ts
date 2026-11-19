/**
 * AI simulator controls — TEST/DEV ONLY.
 *
 * Lets tests reproduce slow providers, 429s, 500s and network failures without
 * touching the real Gemini API. Configured from environment defaults and/or the
 * dev-only `POST /api/dev/ai-sim` endpoint (requires ENABLE_DEV_SEED=true).
 * Never active in production: the mock provider is only selected when
 * AI_PROVIDER=mock.
 */

export type SimulatedFailure = "none" | "http429" | "http500" | "http503" | "network";

interface SimConfig {
  delayMs: number;
  failure: SimulatedFailure;
  /** How many consecutive calls fail before recovering (0 = always). */
  failTimes: number;
}

let config: SimConfig = {
  delayMs: Number(process.env.AI_MOCK_DELAY_MS ?? 0) || 0,
  failure: (process.env.AI_MOCK_FAIL_MODE as SimulatedFailure) || "none",
  failTimes: Number(process.env.AI_MOCK_FAIL_TIMES ?? 0) || 0,
};

let failuresServed = 0;

export function getSimConfig(): SimConfig {
  return { ...config };
}

export function configureSimulator(patch: Partial<SimConfig>): SimConfig {
  config = { ...config, ...patch };
  failuresServed = 0;
  return getSimConfig();
}

export function resetSimulator(): void {
  failuresServed = 0;
}

/** Returns a failure mode to emulate for this call, decrementing the budget. */
export function nextSimulatedFailure(): SimulatedFailure {
  if (config.failure === "none") return "none";
  if (config.failTimes === 0) return config.failure;
  if (failuresServed < config.failTimes) {
    failuresServed += 1;
    return config.failure;
  }
  return "none";
}

export function simulatedDelayMs(): number {
  return config.delayMs;
}
