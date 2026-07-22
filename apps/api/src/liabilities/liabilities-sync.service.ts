import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AccountBase } from "plaid";
import { CryptoService } from "../crypto/crypto.service";
import { mapPlaidAccount } from "../items/account.mapper";
import { PlaidService } from "../plaid/plaid.service";
import { PrismaOwnerService } from "../prisma/prisma-owner.service";
import {
  LiabilityRecord,
  mapCreditCardLiability,
  mapMortgageLiability,
  mapStudentLoan,
} from "./liability.mappers";

export interface LiabilitiesSyncResult {
  itemId: string;
  liabilities: number;
  /** Set when liabilities were skipped (e.g. institution has none). */
  skipped?: string;
}

/** plaid account id -> our uuid */
type IdMap = Map<string, string>;

/** Plaid error codes where "no liabilities" is expected, not a failure. */
const SKIPPABLE_CODES = new Set([
  "PRODUCTS_NOT_SUPPORTED",
  "NO_LIABILITY_ACCOUNTS",
  "NO_ACCOUNTS",
  "PRODUCT_NOT_READY", // still initializing — a webhook will re-trigger us
]);

/**
 * Pulls Plaid Liabilities for one Item: credit / student / mortgage detail (APR,
 * statement + due dates, minimum payment). Best-effort — an institution without
 * liability accounts is skipped, not failed. Idempotent: the item's liabilities
 * are replaced wholesale each run (one row per liability account).
 */
@Injectable()
export class LiabilitiesSyncService {
  private readonly logger = new Logger(LiabilitiesSyncService.name);

  constructor(
    private readonly prisma: PrismaOwnerService,
    private readonly plaid: PlaidService,
    private readonly crypto: CryptoService,
  ) {}

  async syncItem(itemId: string): Promise<LiabilitiesSyncResult> {
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
      const res = await this.plaid.liabilities(accessToken);
      await this.upsertAccounts(item.id, res.accounts, accountMap);
      count = await this.replaceLiabilities(accountMap, res.liabilities);
    } catch (err) {
      const code = this.skipCode(err, item.id);
      if (!code) throw err;
      skipped = code;
    }

    this.logger.log(
      `liabilities ${item.institutionName ?? item.id}: ${count} accounts${skipped ? ` (skipped: ${skipped})` : ""}`,
    );
    return { itemId: item.id, liabilities: count, skipped };
  }

  // --- helpers -------------------------------------------------------------

  private async upsertAccounts(
    itemId: string,
    accounts: AccountBase[],
    accountMap: IdMap,
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

  /** Replace this item's liabilities wholesale — one row per liability account. */
  private async replaceLiabilities(
    accountMap: IdMap,
    liabilities: Awaited<ReturnType<PlaidService["liabilities"]>>["liabilities"],
  ): Promise<number> {
    const itemAccountIds = [...new Set(accountMap.values())];
    const records: LiabilityRecord[] = [];

    const push = (accountId: string | null | undefined, record: LiabilityRecord | null) => {
      if (accountId && record) records.push(record);
    };

    for (const c of liabilities.credit ?? []) {
      const accountId = c.account_id ? accountMap.get(c.account_id) : undefined;
      if (accountId) push(accountId, mapCreditCardLiability(accountId, c));
    }
    for (const s of liabilities.student ?? []) {
      const accountId = s.account_id ? accountMap.get(s.account_id) : undefined;
      if (accountId) push(accountId, mapStudentLoan(accountId, s));
    }
    for (const m of liabilities.mortgage ?? []) {
      const accountId = m.account_id ? accountMap.get(m.account_id) : undefined;
      if (accountId) push(accountId, mapMortgageLiability(accountId, m));
    }

    await this.prisma.$transaction([
      this.prisma.liability.deleteMany({ where: { accountId: { in: itemAccountIds } } }),
      this.prisma.liability.createMany({ data: records, skipDuplicates: true }),
    ]);
    return records.length;
  }

  /** Returns the Plaid error code if it's an expected "no liabilities" skip, else undefined. */
  private skipCode(err: unknown, itemId: string): string | undefined {
    const code = (err as { response?: { data?: { error_code?: string } } })?.response?.data
      ?.error_code;
    if (code && SKIPPABLE_CODES.has(code)) {
      this.logger.warn(`liabilities skipped for item ${itemId}: ${code}`);
      return code;
    }
    return undefined;
  }
}
