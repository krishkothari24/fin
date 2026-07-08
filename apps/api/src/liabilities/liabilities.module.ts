import { Module } from "@nestjs/common";
import { PlaidModule } from "../plaid/plaid.module";
import { LiabilitiesController } from "./liabilities.controller";
import { LiabilitiesService } from "./liabilities.service";
import { LiabilitiesSyncService } from "./liabilities-sync.service";

/**
 * Plaid Liabilities: the read API (card / loan detail) and the sync engine that
 * pulls it. LiabilitiesSyncService is exported so the sync queue can run it as a
 * background job. PrismaModule + CryptoModule are @Global, so only PlaidModule
 * needs importing.
 */
@Module({
  imports: [PlaidModule],
  controllers: [LiabilitiesController],
  providers: [LiabilitiesService, LiabilitiesSyncService],
  exports: [LiabilitiesSyncService],
})
export class LiabilitiesModule {}
