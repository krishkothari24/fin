import { Module } from "@nestjs/common";
import { PlaidModule } from "../plaid/plaid.module";
import { PlaidWebhookController } from "./plaid-webhook.controller";
import { QueueService } from "./queue.service";
import { SyncService } from "./sync.service";
import { WebhookVerificationService } from "./webhook-verification.service";

/**
 * The sync pipeline: the webhook endpoint, signature verification, the pg-boss
 * job queue + worker, and the /transactions/sync engine. PrismaModule and
 * CryptoModule are @Global, so only PlaidModule needs importing here.
 */
@Module({
  imports: [PlaidModule],
  controllers: [PlaidWebhookController],
  providers: [SyncService, QueueService, WebhookVerificationService],
  exports: [SyncService, QueueService],
})
export class SyncModule {}
