import { currentRequest } from "./request-context";

type Level = "debug" | "info" | "warn" | "error";

/**
 * Minimal structured logger. Emits one JSON object per line (LOG_JSON=true, the
 * prod default on log-aggregating hosts) or a compact human line otherwise.
 * The current request id is folded in automatically from AsyncLocalStorage.
 *
 * Deliberately dependency-free — this is an aggregation/dashboard backend, not a
 * place that needs a full logging framework.
 */
let jsonMode = process.env.NODE_ENV === "production";

export function configureLogging(json: boolean): void {
  jsonMode = json;
}

export function logLine(level: Level, message: string, fields: Record<string, unknown> = {}): void {
  const requestId = currentRequest()?.requestId;
  const record = {
    level,
    time: new Date().toISOString(),
    msg: message,
    ...(requestId ? { requestId } : {}),
    ...fields,
  };

  const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
  if (jsonMode) {
    stream.write(JSON.stringify(record) + "\n");
    return;
  }
  const extra = Object.entries(fields)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" ");
  stream.write(
    `${record.time} ${level.toUpperCase().padEnd(5)} ${message}${extra ? " " + extra : ""}${
      requestId ? ` (req ${requestId})` : ""
    }\n`,
  );
}
