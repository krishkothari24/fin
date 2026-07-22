import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { TransactionStream } from "plaid";
import { RecurringDirection } from "@fin/shared";
import { CryptoService } from "../crypto/crypto.service";
import { PlaidService } from "../plaid/plaid.service";
import { PrismaOwnerService } from "../prisma/prisma-owner.service";
import { RecurringStreamRecord, mapTransactionStream } from "./recurring.mappers";

export interface RecurringSyncResult {
  itemId: string;
  streams: number;
  /** Set when recurring was skipped (e.g. transactions not ready yet). */
  skipped?: string;
}

/** plaid account id -> our uuid */
type IdMap = Map<string, string>;

/** Plaid error codes where "no recurring data yet" is expected, not a failure. */
const SKIPPABLE_CODES = new Set([
  "PRODUCTS_NOT_SUPPORTED",
  "NO_ACCOUNTS",
  "PRODUCT_NOT_READY", // transactions still initializing — a webhook will re-trigger us
]);

/**
 * Pulls Plaid Recurring Transactions for one Item: detected inflow + outflow
 * streams (subscriptions, bills, paychecks). Derived from the Transactions
 * product, so it only returns data once transactions have been synced. Idempotent:
 * the item's streams are replaced wholesale each run (Plaid returns the full
 * current set, active and inactive, every call).
 */
@Injectable()
export class RecurringSyncService {
  private readonly logger = new Logger(RecurringSyncService.name);

  constructor(
    private readonly prisma: PrismaOwnerService,
    private readonly plaid: PlaidService,
    private readonly crypto: CryptoService,
  ) {}

  async syncItem(itemId: string): Promise<RecurringSyncResult> {
    const item = await this.prisma.plaidItem.findUnique({
      where: { id: itemId },
      include: { accounts: true },
    });
    if (!item) throw new NotFoundException(`Item ${itemId} not found`);

    const accessToken = this.crypto.decrypt(item.accessTokenCiphertext);
    const accountMap: IdMap = new Map(item.accounts.map((a) => [a.plaidAccountId, a.id]));

    let count = 0;
    let skipped: string | undefined;
    try {
      const res = await this.plaid.transactionsRecurring(accessToken);
      const records = [
        ...this.mapStreams(accountMap, res.inflow_streams, "inflow"),
        ...this.mapStreams(accountMap, res.outflow_streams, "outflow"),
      ];
      count = await this.replaceStreams(accountMap, records);
    } catch (err) {
      const code = this.skipCode(err, item.id);
      if (!code) throw err;
      skipped = code;
    }

    this.logger.log(
      `recurring ${item.institutionName ?? item.id}: ${count} streams${skipped ? ` (skipped: ${skipped})` : ""}`,
    );
    return { itemId: item.id, streams: count, skipped };
  }

  // --- helpers -------------------------------------------------------------

  private mapStreams(
    accountMap: IdMap,
    streams: TransactionStream[],
    direction: RecurringDirection,
  ): RecurringStreamRecord[] {
    return streams.flatMap((s) => {
      const accountId = accountMap.get(s.account_id);
      if (!accountId) {
        this.logger.warn(`recurring stream ${s.stream_id} references unknown account; skipping`);
        return [];
      }
      return [mapTransactionStream(accountId, direction, s)];
    });
  }

  /** Replace this item's recurring streams wholesale — Plaid returns the full set each call. */
  private async replaceStreams(
    accountMap: IdMap,
    records: RecurringStreamRecord[],
  ): Promise<number> {
    const itemAccountIds = [...new Set(accountMap.values())];
    await this.prisma.$transaction([
      this.prisma.recurringStream.deleteMany({ where: { accountId: { in: itemAccountIds } } }),
      this.prisma.recurringStream.createMany({ data: records, skipDuplicates: true }),
    ]);
    return records.length;
  }

  /** Returns the Plaid error code if it's an expected "no recurring yet" skip, else undefined. */
  private skipCode(err: unknown, itemId: string): string | undefined {
    const code = (err as { response?: { data?: { error_code?: string } } })?.response?.data
      ?.error_code;
    if (code && SKIPPABLE_CODES.has(code)) {
      this.logger.warn(`recurring skipped for item ${itemId}: ${code}`);
      return code;
    }
    return undefined;
  }
}
