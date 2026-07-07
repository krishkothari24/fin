import { Injectable, NestMiddleware } from "@nestjs/common";
import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";
import { requestContext } from "./request-context";
import { logLine } from "./structured-logger";

/**
 * Runs first for every request. It:
 *   1. assigns a request id (honouring an inbound `x-request-id`) and echoes it,
 *   2. opens an AsyncLocalStorage scope so every downstream log line is correlated,
 *   3. writes one access-log line when the response finishes — capturing the FINAL
 *      status for every path, including guard rejections (401/429) and 404s that
 *      never reach a controller/interceptor.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const inbound = req.headers["x-request-id"];
    const requestId = (Array.isArray(inbound) ? inbound[0] : inbound) || randomUUID();
    res.setHeader("x-request-id", requestId);

    const start = Date.now();
    const store = { requestId };

    requestContext.run(store, () => {
      res.on("finish", () => {
        // The auth guard populates req.user later in the pipeline; by "finish" it's set.
        const userId = (req as Request & { user?: { id?: string } }).user?.id;
        if (userId) (store as { userId?: string }).userId = userId;
        const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
        logLine(level, "request", {
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          durationMs: Date.now() - start,
          ...(userId ? { userId } : {}),
        });
      });
      next();
    });
  }
}
