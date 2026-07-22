import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AppConfigModule } from "./config/config.module";
import { PrismaModule } from "./prisma/prisma.module";
import { CryptoModule } from "./crypto/crypto.module";
import { AuthModule } from "./auth/auth.module";
import { SupabaseJwtGuard } from "./auth/supabase-jwt.guard";
import { UserContextInterceptor } from "./auth/user-context.interceptor";
import { HealthModule } from "./health/health.module";
import { ItemsModule } from "./items/items.module";
import { SyncModule } from "./sync/sync.module";
import { AccountsModule } from "./accounts/accounts.module";
import { TransactionsModule } from "./transactions/transactions.module";
import { AggregationsModule } from "./aggregations/aggregations.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { InvestmentsModule } from "./investments/investments.module";
import { LiabilitiesModule } from "./liabilities/liabilities.module";
import { RecurringModule } from "./recurring/recurring.module";
import { ManualAssetsModule } from "./manual-assets/manual-assets.module";
import { BudgetsModule } from "./budgets/budgets.module";
import { GoalsModule } from "./goals/goals.module";
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
    InvestmentsModule,
    LiabilitiesModule,
    RecurringModule,
    ManualAssetsModule,
    BudgetsModule,
    GoalsModule,
  ],
  providers: [
    // Global rate-limit guard. Runs ahead of the auth guard; @SkipThrottle exempts
    // the webhook + health check, @Throttle tightens the auth endpoints.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Global auth guard — default-deny. Every route needs a valid Supabase JWT
    // unless explicitly marked @Public() (health check, Plaid webhook — the
    // latter has its own signature-based verification instead).
    { provide: APP_GUARD, useClass: SupabaseJwtGuard },
    // Runs after the guard above (interceptors always run after guards):
    // scopes every DB call for the rest of the request to the authenticated
    // user, which is what Phase 13's FORCE ROW LEVEL SECURITY policies key off.
    { provide: APP_INTERCEPTOR, useClass: UserContextInterceptor },
  ],
})
export class AppModule {}
