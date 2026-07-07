import { Module } from "@nestjs/common";
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

@Module({
  imports: [
    AppConfigModule,
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
    // Phase 6: hardening (RLS, rate limiting, logging, Sentry, Plaid Production).
  ],
})
export class AppModule {}
