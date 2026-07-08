import { Module } from "@nestjs/common";
import { PlaidModule } from "../plaid/plaid.module";
import { RecurringController } from "./recurring.controller";
import { RecurringService } from "./recurring.service";
import { RecurringSyncService } from "./recurring-sync.service";

/**
 * Plaid Recurring Transactions: the read API (subscriptions / bills / paychecks)
 * and the sync engine that pulls the streams. RecurringSyncService is exported so
 * the sync queue can run it as a background job. PrismaModule + CryptoModule are
 * @Global, so only PlaidModule needs importing.
 */
@Module({
  imports: [PlaidModule],
  controllers: [RecurringController],
  providers: [RecurringService, RecurringSyncService],
  exports: [RecurringSyncService],
})
export class RecurringModule {}
