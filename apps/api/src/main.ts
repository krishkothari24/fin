import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  // rawBody: true keeps the unparsed body available (req.rawBody) so we can
  // verify Plaid's webhook signature over the exact bytes Plaid hashed.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  const config = app.get(ConfigService);
  const port = config.get<number>("PORT") ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`fin-api listening on http://localhost:${port}/api/health`);
}

void bootstrap();
