/**
 * Deterministic mock provider for unit and browser tests.
 * NOT used in production (AI_PROVIDER=gemini). Implements transparent rules so
 * test expectations are stable and offline.
 */
import type { AIProvider, ClassificationInput, ClassificationResult } from "./provider";
import { ProviderError } from "./errors";
import { nextSimulatedFailure, simulatedDelayMs } from "./simulator";

const PROFANITY = [
  // English
  "fuck", "fucking", "shit", "bitch", "asshole", "bastard", "motherfucker",
  "crap", "damn", "hell", "dick", "piss", "wtf", "stfu", "douchebag",
  // Russian / Kazakh (Cyrillic)
  "блядь", "бля", "блять", "нахуй", "похуй", "хуй", "хер", "хрен", "говно",
  "дерьмо", "сука", "сучка", "пиздец", "пизда", "ебать", "ёб", "ёпта",
  "чёрт", "черт", "заеб", "нахер", "мудак", "урод",
  // Russian / Kazakh (transliterated)
  "blyad", "blyat", "nahui", "hui", "gówno", "govno", "suka", "pizdec",
  "siktir", "kotek", "ekekteme",
];

const profanityRe = new RegExp(
  `(?<![\\p{L}])(${PROFANITY.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}])`,
  "iu"
);

const arithmeticRe = /(\d+)\s*([+\-*x×])\s*(\d+)\s*=\s*(-?\d+)/g;

const MISS_OFF_TOPIC =
  /^(lol|lmao|rofl|haha|heh+|the weather|nice weather|whatever|who cares|i like (cats|dogs)|did you (see|watch)|what'?s for (lunch|dinner)|lol\.)\b/i;

const detectLanguage = (text: string): string => {
  if (/[әіңғүұқөһ]/i.test(text)) return "kk";
  if (/[а-яё]/i.test(text)) return "ru";
  return "en";
};

/**
 * Test-only directive parser. In mock mode, a message may start with
 * [[delay:1500]] to simulate provider latency, or [[fail:429]] / [[fail:500]] /
 * [[fail:503]] / [[fail:network]] / [[fail:timeout]] to simulate provider errors.
 * Routes strip these directives before persistence when AI_PROVIDER=mock.
 * Never interpreted outside mock mode.
 */
export interface MockDirective {
  delayMs?: number;
  fail?: string;
}

export function parseMockDirective(message: string): MockDirective {
  const directive: MockDirective = {};
  const delay = message.match(/^\[\[delay:(\d+)\]\]\s*/);
  if (delay) directive.delayMs = Math.min(Number(delay[1]), 30_000);
  const fail = message.match(/^\[\[fail:([0-9]{3}|network|timeout|error)\]\]\s*/);
  if (fail) directive.fail = fail[1];
  return directive;
}

export function stripMockDirective(message: string): string {
  let text = message;
  // Strip at most two leading directives (delay + fail), in any order.
  for (let i = 0; i < 2; i++) {
    const before = text;
    text = text.replace(/^\[\[(delay:[0-9]+|fail:[0-9a-z]+)\]\]\s*/i, "");
    if (text === before) break;
  }
  return text;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class MockProvider implements AIProvider {
  readonly name = "mock";
  readonly model = "mock-deterministic-v1";
  readonly fastInline = false;

  async classify(input: ClassificationInput): Promise<ClassificationResult> {
    const directive = parseMockDirective(input.message);
    if (directive.delayMs) {
      await sleep(directive.delayMs);
    }
    if (directive.fail) {
      const status = Number(directive.fail) || undefined;
      throw new ProviderError(`Mock provider failure (${directive.fail})`, {
        retryable: directive.fail === "429" || Number(directive.fail) >= 500 || directive.fail === "network",
        status: status ?? null,
        retryAfterMs: directive.fail === "429" ? 1500 : directive.fail === "503" ? 800 : null,
      });
    }

    const delay = simulatedDelayMs();
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    const failure = nextSimulatedFailure();
    if (failure === "http429") {
      throw new ProviderError("Simulated 429 rate limit", { retryable: true, status: 429, retryAfterMs: 1000 });
    }
    if (failure === "http500") {
      throw new ProviderError("Simulated 500 server error", { retryable: true, status: 500 });
    }
    if (failure === "http503") {
      throw new ProviderError("Simulated 503 unavailable", { retryable: true, status: 503, retryAfterMs: 500 });
    }
    if (failure === "network") {
      throw new ProviderError("Simulated network failure", { retryable: true });
    }

    const text = stripMockDirective(input.message);
    const language = detectLanguage(text);
    const done = (
      category: ClassificationResult["category"],
      confidence: number,
      reason: string
    ): ClassificationResult => ({ category, confidence, reason, language, provider: this.name, model: this.model });

    // 1) Profanity → blunder
    const profanityHit = profanityRe.exec(text);
    if (profanityHit) {
      return done("blunder", 0.97, `Contains profanity ("${profanityHit[1]}").`);
    }

    // 2) Wrong arithmetic → mistake
    let m: RegExpExecArray | null;
    const arith = new RegExp(arithmeticRe.source, "g");
    while ((m = arith.exec(text)) !== null) {
      const a = Number(m[1]);
      const op = m[2]!.toLowerCase();
      const b = Number(m[3]);
      const claimed = Number(m[4]);
      const actual =
        op === "+" ? a + b : op === "-" ? a - b : op === "*" || op === "x" || op === "×" ? a * b : NaN;
      if (!Number.isNaN(actual) && actual !== claimed) {
        return done("mistake", 0.92, `Arithmetic is incorrect: ${a} ${op} ${b} ≠ ${claimed}.`);
      }
    }

    // 3) Explicitly flags a factual error containing digits
    if (/\b(actually,? no|that('s| i)s wrong|you('re| are) wrong|incorrect|not correct|false)\b/i.test(text) && /[0-9]/.test(text)) {
      return done("mistake", 0.7, "Flags a factual error.");
    }

    // 4) Supportive / helpful → best
    if (/\b(thank(s| you)|thx|appreciate|helpful|helped me|great explanation|you saved|lifesaver)\b/i.test(text)) {
      return done("best", 0.9, "Supportive or appreciative message.");
    }

    // 5) Interesting / noteworthy → great
    if (/\b(interesting|impressive|clever|fascinating|great (point|idea|observation)|wow,? (that|that's)|neat)\b/i.test(text)) {
      return done("great", 0.88, "Interesting or noteworthy content.");
    }

    // 6) Miss: off-topic reply to a question
    const lastContext = input.context[input.context.length - 1];
    if (lastContext && lastContext.content.includes("?") && MISS_OFF_TOPIC.test(text.trim())) {
      return done("miss", 0.85, "Off-topic reply to a question.");
    }

    // 7) Greetings / small talk / agreement → excellent
    if (/^(hi|hello|hey|yo|salem|assalam|good (morning|afternoon|evening|day)|how are you|how'?s it going|what'?s up)\b/i.test(text.trim())) {
      return done("excellent", 0.9, "Friendly greeting.");
    }
    if (/\b(good|nice|great|awesome|perfect|love it|sounds good|agreed?|agree|makes sense|cool|exactly|right)\b/i.test(text)) {
      return done("excellent", 0.82, "Positive or agreeable message.");
    }

    // 8) Fallback: shallow positive with low confidence.
    return done("excellent", 0.5, "No strong signal; default classification.");
  }
}
