import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AppConfigModule } from "./config/config.module";
import { PrismaModule } from "./prisma/prisma.module";
import { CryptoModule } from "./crypto/crypto.module";
import { AuthModule } from "./auth/auth.module";
import { HealthModule } from "./health/health.module";
import { ItemsModule } from "./items/items.module";
import { SyncModule } from "./sync/sync.module";
import { AccountsModule } from "./accounts/accounts.module";
import { TransactionsModule } from "./transactions/transactions.module";
import { AggregationsModule } from "./aggregations/aggregations.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { ObservabilityModule } from "./observability/observability.module";

@Module({
  imports: [
    AppConfigModule,
    // Phase 6: per-IP rate limiting. In-memory (per-instance) — fine for a single
    // service; swap in a shared store if we ever scale horizontally.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>("RATE_LIMIT_TTL", 60) * 1000, // seconds -> ms
            limit: config.get<number>("RATE_LIMIT_LIMIT", 120),
          },
        ],
      }),
    }),
    ObservabilityModule,
    PrismaModule,
    CryptoModule,
    AuthModule,
    HealthModule,
    ItemsModule,
    SyncModule,
    AccountsModule,
    TransactionsModule,
    AggregationsModule,
    DashboardModule,
  ],
  providers: [
    // Global rate-limit guard. Runs ahead of route guards; @SkipThrottle exempts
    // the webhook + health check, @Throttle tightens the auth endpoints.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
