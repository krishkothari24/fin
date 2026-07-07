import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { applyHardening } from "./bootstrap";
import { logLine } from "./observability/structured-logger";

async function bootstrap() {
  // rawBody: true keeps the unparsed body available (req.rawBody) so we can
  // verify Plaid's webhook signature over the exact bytes Plaid hashed.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  applyHardening(app);

  const config = app.get(ConfigService);
  const nodeEnv = config.get<string>("NODE_ENV", "development");
  const port = config.get<number>("PORT") ?? 3000;
  await app.listen(port);
  logLine("info", "fin-api listening", {
    port,
    env: nodeEnv,
    url: `http://localhost:${port}/api/health`,
  });
}

void bootstrap();
