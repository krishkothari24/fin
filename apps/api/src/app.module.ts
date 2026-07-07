import { Module } from "@nestjs/common";
import { AppConfigModule } from "./config/config.module";
import { PrismaModule } from "./prisma/prisma.module";
import { CryptoModule } from "./crypto/crypto.module";
import { AuthModule } from "./auth/auth.module";
import { HealthModule } from "./health/health.module";
import { ItemsModule } from "./items/items.module";

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    CryptoModule,
    AuthModule,
    HealthModule,
    ItemsModule,
    // Phase 3+: SyncModule (webhooks + jobs), AccountsModule, TransactionsModule,
    // AggregationsModule, DashboardModule.
  ],
})
export class AppModule {}
