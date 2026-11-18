import { NextRequest, NextResponse } from "next/server";
import { processAnalysisQueue } from "@/lib/ai/pipeline";
import { requireUser, jsonError } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rateLimit";

/**
 * Drain the analysis queue. Used by cron/serverless schedulers and by the UI
 * to nudge pending classifications. Authenticated users may trigger it for
 * their own instance; the work itself is global but bounded.
 */
export async function POST(request: NextRequest) {
  const isCron = request.headers.get("x-cron-secret");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && isCron === cronSecret) {
    const summary = await processAnalysisQueue(10);
    return NextResponse.json({ summary });
  }
  const { user, error } = await requireUser();
  if (error) return error;
  const limited = rateLimit(`analysis-process:${user.id}`, 30, 60);
  if (!limited.allowed) return jsonError(429, "Too many requests");
  const summary = await processAnalysisQueue(5);
  return NextResponse.json({ summary });
}
