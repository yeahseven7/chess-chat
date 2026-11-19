/**
 * Lightweight, content-free performance instrumentation.
 * Logs structured JSON lines with durations in milliseconds.
 * NEVER logs message contents — only lengths, counts and identifiers.
 */

interface PerfExtra {
  [key: string]: string | number | boolean;
}

export function perfLog(name: string, durationMs: number, extra?: PerfExtra): void {
  const rounded = Math.round(durationMs * 10) / 10;
  // console.log/console.info are dropped by the production server pipeline —
  // use console.error so perf lines are visible everywhere (CI included).
  console.error(JSON.stringify({ evt: "perf", name, durationMs: rounded, ...extra }));
}

/** Measure an async operation. Emits a perf log line on completion (success or failure). */
export async function timed<T>(name: string, fn: () => Promise<T>, extra?: PerfExtra): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    perfLog(name, performance.now() - start, extra);
    return result;
  } catch (error) {
    perfLog(`${name}.error`, performance.now() - start, {
      ...extra,
      error: error instanceof Error ? error.message.slice(0, 120) : "unknown",
    });
    throw error;
  }
}

export function startTimer(): () => number {
  const start = performance.now();
  return () => performance.now() - start;
}
