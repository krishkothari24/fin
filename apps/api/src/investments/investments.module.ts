import { Module } from "@nestjs/common";
import { PlaidModule } from "../plaid/plaid.module";
import { InvestmentsController } from "./investments.controller";
import { InvestmentsService } from "./investments.service";
import { InvestmentsSyncService } from "./investments-sync.service";

/**
 * Plaid Investments: the read API (holdings + investment transactions) and the
 * sync engine that pulls them. InvestmentsSyncService is exported so the sync
 * queue can run it as a background job. PrismaModule + CryptoModule are @Global,
 * so only PlaidModule needs importing.
 */
@Module({
  imports: [PlaidModule],
  controllers: [InvestmentsController],
  providers: [InvestmentsService, InvestmentsSyncService],
  exports: [InvestmentsSyncService],
})
export class InvestmentsModule {}
