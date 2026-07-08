import { Module } from "@nestjs/common";
import { InvestmentsModule } from "../investments/investments.module";
import { LiabilitiesModule } from "../liabilities/liabilities.module";
import { RecurringModule } from "../recurring/recurring.module";
import { PlaidModule } from "../plaid/plaid.module";
import { PlaidWebhookController } from "./plaid-webhook.controller";
import { QueueService } from "./queue.service";
import { SnapshotService } from "./snapshot.service";
import { SyncService } from "./sync.service";
import { WebhookVerificationService } from "./webhook-verification.service";

/**
 * The sync pipeline: the webhook endpoint, signature verification, the pg-boss
 * job queue + worker, and the /transactions/sync engine. PrismaModule and
 * CryptoModule are @Global, so only PlaidModule needs importing here.
 */
@Module({
  imports: [PlaidModule, InvestmentsModule, LiabilitiesModule, RecurringModule],
  controllers: [PlaidWebhookController],
  providers: [SyncService, QueueService, WebhookVerificationService, SnapshotService],
  exports: [SyncService, QueueService, SnapshotService],
})
export class SyncModule {}
