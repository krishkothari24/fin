import * as Sentry from "@sentry/node";
import { logLine } from "./structured-logger";

/**
 * Error monitoring, gated entirely on SENTRY_DSN. Importing this file patches
 * nothing; only initErrorReporter() (called once at boot, when a DSN is present)
 * turns Sentry on. Without a DSN, captureError just logs — zero external calls.
 */
let enabled = false;

export function initErrorReporter(opts: { dsn?: string; environment: string }): void {
  if (!opts.dsn) return;
  Sentry.init({
    dsn: opts.dsn,
    environment: opts.environment,
    // We capture exceptions explicitly (see the exception filter); no perf tracing.
    tracesSampleRate: 0,
  });
  enabled = true;
  logLine("info", "sentry: error monitoring enabled", { environment: opts.environment });
}

export function isErrorReportingEnabled(): boolean {
  return enabled;
}

/** Report an unexpected error with request context. Safe no-op when Sentry is off. */
export function captureError(
  err: unknown,
  context: { requestId?: string; userId?: string; path?: string } = {},
): void {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    if (context.requestId) scope.setTag("request_id", context.requestId);
    if (context.userId) scope.setUser({ id: context.userId });
    if (context.path) scope.setTag("path", context.path);
    Sentry.captureException(err);
  });
}
