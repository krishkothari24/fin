import { Module } from "@nestjs/common";
import { AppConfigModule } from "./config/config.module";
import { PrismaModule } from "./prisma/prisma.module";
import { CryptoModule } from "./crypto/crypto.module";
import { AuthModule } from "./auth/auth.module";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    CryptoModule,
    AuthModule,
    HealthModule,
    // Phase 2+: PlaidModule, ItemsModule, AccountsModule, TransactionsModule,
    // SyncModule, AggregationsModule, DashboardModule.
  ],
})
export class AppModule {}
