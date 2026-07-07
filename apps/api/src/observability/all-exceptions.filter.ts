import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Request, Response } from "express";
import { captureError } from "./error-reporter";
import { currentRequest } from "./request-context";
import { logLine } from "./structured-logger";

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  requestId?: string;
  path: string;
}

/**
 * The single place every error becomes an HTTP response. Client errors
 * (HttpException — 4xx, thrown deliberately) pass through with their message.
 * Anything else is an unexpected 500: we log the full error + stack server-side
 * and report it to Sentry, but return only a generic message to the caller so
 * we never leak stack traces, SQL, or Prisma internals to clients.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = currentRequest()?.requestId ?? (res.getHeader("x-request-id") as string);

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === "string"
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);
      this.send(res, {
        statusCode: status,
        error: HttpStatus[status] ?? "Error",
        message,
        requestId,
        path: req.originalUrl,
      });
      return;
    }

    // Unexpected — treat as 500, log everything, surface nothing sensitive.
    const err = exception instanceof Error ? exception : new Error(String(exception));
    logLine("error", "unhandled exception", {
      name: err.name,
      error: err.message,
      stack: err.stack,
      path: req.originalUrl,
    });
    captureError(err, {
      requestId,
      userId: (req as Request & { user?: { id?: string } }).user?.id,
      path: req.originalUrl,
    });
    this.send(res, {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: "Internal Server Error",
      message: "Something went wrong. Please try again.",
      requestId,
      path: req.originalUrl,
    });
  }

  private send(res: Response, body: ErrorBody): void {
    if (res.headersSent) return;
    res.status(body.statusCode).json(body);
  }
}
