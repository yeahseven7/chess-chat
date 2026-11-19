/** Interchangeable AI classification provider architecture. */
import type { Classification } from "./schema";

export interface ClassificationInput {
  message: string;
  /** Recent context (oldest → newest), already trimmed by the caller. */
  context: Array<{ sender: string; content: string }>;
  authorName: string;
}

export interface ClassificationResult extends Classification {
  /** Provider + model actually used — stored on the reaction row. */
  provider: string;
  model: string;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  /** When false (slow providers, tests), the send path uses the pusher loop instead of an inline worker. */
  readonly fastInline: boolean;
  classify(input: ClassificationInput): Promise<ClassificationResult>;
}
