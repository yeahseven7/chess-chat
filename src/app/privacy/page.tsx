import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/ReactionGlyph";

export const metadata: Metadata = { title: "Privacy & Data" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/" className="flex w-fit items-center gap-2">
        <LogoMark size={28} />
        <span className="font-bold text-cream-100">ChessChat</span>
      </Link>
      <h1 className="mt-8 text-3xl font-bold">Privacy &amp; Data Processing</h1>
      <div className="prose prose-invert mt-6 space-y-4 text-sm leading-relaxed text-cream-300">
        <p>
          ChessChat analyzes the content of messages you send in order to assign one of six
          playful, chess-review-style reactions. This page explains exactly what that means.
        </p>
        <h2 className="text-lg font-semibold text-cream-100">What is sent to the AI provider</h2>
        <p>
          When a message is sent (or edited), the message text and up to six recent context
          messages from the same conversation are transmitted to the configured AI provider
          (<strong>Google Gemini</strong> by default, via GEMINI_MODEL) to classify the message.
          Only what is needed for classification is sent. Your password is never sent.
        </p>
        <h2 className="text-lg font-semibold text-cream-100">What is stored</h2>
        <p>
          Messages, reactions, confidences, provider/model identifiers, timestamps and
          conversation metadata are stored in the application database. Reaction explanations
          (reasons) are visible only to conversation participants who hover the reaction — they
          are never published elsewhere. Full private message contents are not written to
          application logs.
        </p>
        <h2 className="text-lg font-semibold text-cream-100">What reactions are not</h2>
        <p>
          AI reactions are a playful signal, similar to an &ldquo;annotation&rdquo; in a chess
          review. They are <strong>not</strong> moderation decisions and are not reliable
          indicators of truth or harm. Use the in-app reporting and blocking tools for actual
          safety concerns; reviewed reports are handled by people, not by reactions.
        </p>
        <h2 className="text-lg font-semibold text-cream-100">Your controls</h2>
        <ul className="list-disc pl-5">
          <li>Message delivery never waits for AI analysis; failed analyses retry with bounded backoff and never delete your message.</li>
          <li>Editing a message re-runs analysis and replaces the previous reaction.</li>
          <li>Deleting a message removes its reaction and excludes it from statistics.</li>
          <li>You may block or report any user at any time.</li>
        </ul>
        <h2 className="text-lg font-semibold text-cream-100">Retention</h2>
        <p>
          Deleted messages are soft-deleted (content cleared, excluded from analysis and
          statistics) and are purged with the conversation lifecycle. Notification bodies are
          truncated to 140 characters.
        </p>
        <p className="text-cream-500">Last updated: November 2026.</p>
      </div>
      <Link href="/" className="mt-8 inline-block text-sm text-accent hover:underline">
        ← Back to ChessChat
      </Link>
    </main>
  );
}
