import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  RawBodyRequest,
  Req,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { Prisma } from "@prisma/client";
import { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { QueueService } from "./queue.service";
import { WebhookVerificationService } from "./webhook-verification.service";

interface PlaidWebhookBody {
  webhook_type: string;
  webhook_code: string;
  item_id: string;
  error?: { error_code?: string } | null;
  [key: string]: unknown;
}

/**
 * Receives Plaid webhooks. Public (no JWT) — Plaid can't send a Supabase token —
 * but every request is signature-verified against Plaid's signing key before we
 * act on it. Always returns 200 quickly; the real work is enqueued.
 *
 * SkipThrottle: Plaid controls delivery (and legitimately retries); signature
 * verification — not rate limiting — is what guards this endpoint.
 */
@SkipThrottle()
@Controller("plaid")
export class PlaidWebhookController {
  private readonly logger = new Logger(PlaidWebhookController.name);

  constructor(
    private readonly verifier: WebhookVerificationService,
    private readonly queue: QueueService,
    private readonly prisma: PrismaService,
  ) {}

  @Post("webhook")
  @HttpCode(200)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers("plaid-verification") verification: string | undefined,
    @Body() body: PlaidWebhookBody,
  ): Promise<{ ok: boolean }> {
    const raw = req.rawBody;
    if (!raw) {
      this.logger.error("rawBody unavailable — cannot verify webhook (is rawBody enabled?)");
      return { ok: false };
    }

    const valid = await this.verifier.verify(verification, raw);
    if (!valid) {
      this.logger.warn(`rejected unverified webhook: ${body?.webhook_type}/${body?.webhook_code}`);
      return { ok: false };
    }

    // Audit trail (best-effort — never let logging failure drop the webhook).
    await this.prisma.webhookEvent
      .create({
        data: {
          itemId: body.item_id ?? null,
          webhookType: body.webhook_type,
          webhookCode: body.webhook_code,
          payload: body as unknown as Prisma.InputJsonValue,
        },
      })
      .catch(() => undefined);

    await this.dispatch(body);
    return { ok: true };
  }

  private async dispatch(body: PlaidWebhookBody): Promise<void> {
    const { webhook_type, webhook_code, item_id } = body;

    // Transactions: new/updated transactions to pull, or recurring streams changed.
    if (webhook_type === "TRANSACTIONS") {
      const item = await this.prisma.plaidItem.findUnique({ where: { plaidItemId: item_id } });
      if (!item) return;
      if (webhook_code === "SYNC_UPDATES_AVAILABLE") await this.queue.enqueueSync(item.id);
      else if (webhook_code === "RECURRING_TRANSACTIONS_UPDATE") {
        await this.queue.enqueueRecurringSync(item.id);
      }
      return;
    }

    // Investments: holdings changed, or new/updated investment transactions are ready.
    if (webhook_type === "HOLDINGS" || webhook_type === "INVESTMENTS_TRANSACTIONS") {
      const item = await this.prisma.plaidItem.findUnique({ where: { plaidItemId: item_id } });
      if (item) await this.queue.enqueueInvestmentsSync(item.id);
      return;
    }

    // Liabilities: card / loan detail updated (webhook_code DEFAULT_UPDATE).
    if (webhook_type === "LIABILITIES") {
      const item = await this.prisma.plaidItem.findUnique({ where: { plaidItemId: item_id } });
      if (item) await this.queue.enqueueLiabilitiesSync(item.id);
      return;
    }

    if (webhook_type === "ITEM" && webhook_code === "ERROR") {
      if (body.error?.error_code === "ITEM_LOGIN_REQUIRED") {
        await this.prisma.plaidItem.updateMany({
          where: { plaidItemId: item_id },
          data: { status: "login_required" },
        });
      }
    }
  }
}
