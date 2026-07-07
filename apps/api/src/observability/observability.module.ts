import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { AllExceptionsFilter } from "./all-exceptions.filter";

/**
 * The catch-all exception filter that sanitizes 500s. Global, so it covers every
 * controller without per-module wiring. The request-context middleware
 * (correlation ids + access logs) is registered directly in bootstrap so it runs
 * ahead of every other middleware.
 */
@Module({
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class ObservabilityModule {}
