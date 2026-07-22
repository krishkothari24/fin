import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AccountBase, RemovedTransaction, Transaction } from "plaid";
import { CryptoService } from "../crypto/crypto.service";
import { mapPlaidAccount } from "../items/account.mapper";
import { PlaidService } from "../plaid/plaid.service";
import { PrismaOwnerService } from "../prisma/prisma-owner.service";
import { mapPlaidTransaction } from "./transaction.mapper";

export interface SyncResult {
  itemId: string;
  added: number;
  modified: number;
  removed: number;
  pages: number;
}

/** plaid account_id -> our Account.id */
type AccountMap = Map<string, string>;

/**
 * The transaction sync engine. Pulls all pending updates for one Item from
 * `/transactions/sync`, resuming from the saved cursor, applying added/modified
 * (upsert) and removed (delete), then advancing the cursor. Cursor is persisted
 * after every page, so an interrupted sync resumes instead of restarting, and
 * the whole thing is idempotent (unique plaid_transaction_id prevents dupes).
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaOwnerService,
    private readonly plaid: PlaidService,
    private readonly crypto: CryptoService,
  ) {}

  async syncItem(itemId: string): Promise<SyncResult> {
    const item = await this.prisma.plaidItem.findUnique({
      where: { id: itemId },
      include: { accounts: true },
    });
    if (!item) throw new NotFoundException(`Item ${itemId} not found`);

    const accessToken = this.crypto.decrypt(item.accessTokenCiphertext);
    const accountMap: AccountMap = new Map(item.accounts.map((a) => [a.plaidAccountId, a.id]));

    let cursor = item.transactionsCursor ?? undefined;
    let added = 0;
    let modified = 0;
    let removed = 0;
    let pages = 0;
    let hasMore = true;

    try {
      while (hasMore) {
        const page = await this.plaid.transactionsSync(accessToken, cursor);
        pages += 1;

        // Ensure every account referenced this page exists (a new account may
        // have appeared) and refresh balances while we're here.
        await this.upsertAccounts(item.id, page.accounts, accountMap);
        await this.applyChanges(accountMap, page.added, page.modified, page.removed);

        added += page.added.length;
        modified += page.modified.length;
        removed += page.removed.length;

        cursor = page.next_cursor;
        hasMore = page.has_more;

        // Persist the cursor per page: a crash resumes here, not from scratch.
        await this.prisma.plaidItem.update({
          where: { id: item.id },
          data: { transactionsCursor: cursor },
        });
      }

      await this.prisma.plaidItem.update({
        where: { id: item.id },
        data: { lastSyncedAt: new Date(), status: "good" },
      });
    } catch (err) {
      await this.markItemError(item.id, err);
      throw err;
    }

    this.logger.log(
      `sync ${item.institutionName ?? item.id}: +${added} ~${modified} -${removed} (${pages} page(s))`,
    );
    return { itemId: item.id, added, modified, removed, pages };
  }

  // --- helpers -------------------------------------------------------------

  private async upsertAccounts(
    itemId: string,
    accounts: AccountBase[],
    accountMap: AccountMap,
  ): Promise<void> {
    for (const a of accounts) {
      const data = mapPlaidAccount(itemId, a);
      const row = await this.prisma.account.upsert({
        where: { plaidAccountId: data.plaidAccountId },
        create: data,
        update: {
          name: data.name,
          officialName: data.officialName,
          currentBalance: data.currentBalance,
          availableBalance: data.availableBalance,
          currency: data.currency,
        },
      });
      accountMap.set(row.plaidAccountId, row.id);
    }
  }

  private async applyChanges(
    accountMap: AccountMap,
    added: Transaction[],
    modified: Transaction[],
    removed: RemovedTransaction[],
  ): Promise<void> {
    for (const t of [...added, ...modified]) {
      const accountId = accountMap.get(t.account_id);
      if (!accountId) {
        this.logger.warn(
          `txn ${t.transaction_id} references unknown account ${t.account_id}; skipping`,
        );
        continue;
      }
      const data = mapPlaidTransaction(accountId, t);
      await this.prisma.transaction.upsert({
        where: { plaidTransactionId: data.plaidTransactionId },
        create: data,
        update: data,
      });
    }

    if (removed.length > 0) {
      await this.prisma.transaction.deleteMany({
        where: { plaidTransactionId: { in: removed.map((r) => r.transaction_id) } },
      });
    }
  }

  private async markItemError(itemId: string, err: unknown): Promise<void> {
    const code =
      (err as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code;
    const status = code === "ITEM_LOGIN_REQUIRED" ? "login_required" : "error";
    await this.prisma.plaidItem
      .update({ where: { id: itemId }, data: { status } })
      .catch(() => undefined);
    this.logger.error(`sync failed for item ${itemId} (status -> ${status}): ${String(err)}`);
  }
}
