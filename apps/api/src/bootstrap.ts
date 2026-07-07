import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { initErrorReporter } from "./observability/error-reporter";
import { RequestContextMiddleware } from "./observability/request-context.middleware";
import { configureLogging } from "./observability/structured-logger";

/**
 * Applies every cross-cutting concern a running instance needs — security
 * headers, CORS, proxy trust, validation, logging/Sentry config, graceful
 * shutdown. Factored out of main.ts so the hardening E2E boots a byte-identical
 * app and can assert these behaviours over real HTTP.
 */
export function applyHardening(app: INestApplication): void {
  const config = app.get(ConfigService);
  const nodeEnv = config.get<string>("NODE_ENV", "development");

  // JSON logs on hosts that aggregate stdout (prod default); pretty lines locally.
  configureLogging(config.get<boolean>("LOG_JSON") ?? nodeEnv === "production");
  // Error monitoring — no-op unless SENTRY_DSN is set.
  initErrorReporter({ dsn: config.get<string>("SENTRY_DSN"), environment: nodeEnv });

  app.setGlobalPrefix("api");

  // Runs first for every request: assigns/echoes x-request-id, opens the
  // AsyncLocalStorage scope, and writes one access-log line on response finish.
  const requestContext = new RequestContextMiddleware();
  app.use((req: Request, res: Response, next: NextFunction) =>
    requestContext.use(req, res, next),
  );

  // Security response headers (nosniff, HSTS, frameguard, no x-powered-by, …).
  app.use(helmet());

  // Behind Render/other proxies, trust N hops so req.ip (the rate-limit key) is
  // the real client rather than the load balancer.
  const trustProxy = config.get<number>("TRUST_PROXY", 0);
  if (trustProxy > 0) {
    app.getHttpAdapter().getInstance().set("trust proxy", trustProxy);
  }

  // CORS: only for browser origins we explicitly allow (the future web app).
  const corsOrigins = config.get<string>("CORS_ORIGINS");
  if (corsOrigins) {
    app.enableCors({
      origin: corsOrigins
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
      credentials: true,
    });
  }

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  // Flush pg-boss + Prisma cleanly on SIGTERM (Render sends it on redeploy).
  app.enableShutdownHooks();
}
