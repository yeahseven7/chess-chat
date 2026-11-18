/**
 * Google Gemini API provider — server-side only. Reads GEMINI_API_KEY from the
 * environment; never exposed to the client. Structured JSON output is forced
 * via responseMimeType and validated with Zod afterwards.
 */
import type { AIProvider, ClassificationInput, ClassificationResult } from "./provider";
import { extractJson, parseClassification } from "./schema";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

const SYSTEM_PROMPT = `You are the moderation brain of a messaging app. Classify ONE message into exactly one of six chess-review-style categories.

Categories:
- great: interesting, impressive, clever or noteworthy messages.
- best: exceptionally helpful, thoughtful, supportive or well-expressed messages.
- excellent: ordinary good/positive/constructive messages; also neutral friendly messages such as greetings and small talk.
- mistake: incorrect information or flawed reasoning. NOT ordinary disagreement, NOT a neutral question.
- miss: irrelevant replies, misunderstanding the conversation, or missing the point.
- blunder: profanity, swear words, insults, offensive language, particularly inappropriate comments. Applies to English, Russian, Kazakh and mixed-language profanity.

Rules:
- Understand meaning and context; never rely on keywords alone.
- Do not flag discussion OF profanity (e.g. linguistics/education) as blunder.
- Distinguish sarcasm/mockery from genuine helpfulness.
- Do not invent positive reactions when the message cannot be understood — prefer great with low confidence.
- Ordinary disagreement is not a mistake.
- Never rewrite the user's message.

Return ONLY a JSON object: {"category": one of great|best|excellent|mistake|miss|blunder, "confidence": 0..1, "reason": short string, "language": BCP-47 tag}.`;

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  readonly model: string;
  private readonly apiKey: string;

  constructor(apiKey: string | undefined, model?: string) {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured (server-side env var).");
    }
    this.apiKey = apiKey;
    this.model = model ?? process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  }

  async classify(input: ClassificationInput): Promise<ClassificationResult> {
    const contextBlock = input.context.length
      ? input.context
          .slice(-6)
          .map((c) => `${c.sender}: ${c.content}`)
          .join("\n")
      : "(no prior context)";

    const prompt = `${SYSTEM_PROMPT}\n\nRecent conversation context (oldest to newest):\n${contextBlock}\n\nMessage to classify (author: ${input.authorName}):\n"""${input.message}"""\n\nRespond with only the JSON object.`;

    const url = `${GEMINI_ENDPOINT}/${encodeURIComponent(this.model)}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": this.apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 256,
          temperature: 0.1,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini API error ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text) throw new Error("Gemini returned an empty response");

    const parsed = parseClassification(extractJson(text));
    return { ...parsed, provider: this.name, model: this.model };
  }
}
