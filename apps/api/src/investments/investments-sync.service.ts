import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InvestmentAccount, Security as PlaidSecurity } from "plaid";
import { CryptoService } from "../crypto/crypto.service";
import { mapPlaidAccount } from "../items/account.mapper";
import { PlaidService } from "../plaid/plaid.service";
import { PrismaOwnerService } from "../prisma/prisma-owner.service";
import {
  mapPlaidHolding,
  mapPlaidInvestmentTransaction,
  mapPlaidSecurity,
} from "./investment.mappers";

export interface InvestmentsSyncResult {
  itemId: string;
  securities: number;
  holdings: number;
  investmentTransactions: number;
  /** Set when investments were skipped (e.g. institution has no investment accounts). */
  skipped?: string;
}

/** plaid id -> our uuid */
type IdMap = Map<string, string>;

/** How far back to pull investment transactions on each sync. */
const INVESTMENT_TXN_WINDOW_DAYS = 730;

/** Plaid error codes where "no investment data" is expected, not a failure. */
const SKIPPABLE_CODES = new Set([
  "PRODUCTS_NOT_SUPPORTED",
  "NO_INVESTMENT_ACCOUNTS",
  "NO_ACCOUNTS",
  "PRODUCT_NOT_READY", // still initializing — a webhook will re-trigger us
]);

/**
 * Pulls Plaid Investments for one Item: current holdings (a snapshot, replaced
 * each run) and investment transactions (date-range paginated, upserted). Both
 * are best-effort per call — an institution without investment accounts is
 * skipped, not failed. Idempotent: holdings are replaced wholesale; investment
 * transactions upsert on their unique Plaid id.
 */
@Injectable()
export class InvestmentsSyncService {
  private readonly logger = new Logger(InvestmentsSyncService.name);

  constructor(
    private readonly prisma: PrismaOwnerService,
    private readonly plaid: PlaidService,
    private readonly crypto: CryptoService,
  ) {}

  async syncItem(itemId: string): Promise<InvestmentsSyncResult> {
    const item = await this.prisma.plaidItem.findUnique({
      where: { id: itemId },
      include: { accounts: true },
    });
    if (!item) throw new NotFoundException(`Item ${itemId} not found`);

    const accessToken = this.crypto.decrypt(item.accessTokenCiphertext);
    const accountMap: IdMap = new Map(item.accounts.map((a) => [a.plaidAccountId, a.id]));
    const securityMap: IdMap = new Map();
    let holdings = 0;
    let investmentTransactions = 0;
    let skipped: string | undefined;

    // 1) Holdings (current snapshot).
    try {
      const res = await this.plaid.investmentsHoldings(accessToken);
      await this.upsertAccounts(item.id, res.accounts, accountMap);
      await this.upsertSecurities(res.securities, securityMap);
      holdings = await this.replaceHoldings(accountMap, securityMap, res.holdings);
    } catch (err) {
      const code = this.skipCode(err, "holdings", item.id);
      if (!code) throw err;
      skipped = code;
    }

    // 2) Investment transactions (date-range paginated).
    try {
      investmentTransactions = await this.syncInvestmentTransactions(
        accessToken,
        item.id,
        accountMap,
        securityMap,
      );
    } catch (err) {
      const code = this.skipCode(err, "investment-transactions", item.id);
      if (!code) throw err;
      skipped ??= code;
    }

    this.logger.log(
      `investments ${item.institutionName ?? item.id}: ${securityMap.size} securities, ` +
        `${holdings} holdings, ${investmentTransactions} txns${skipped ? ` (skipped: ${skipped})` : ""}`,
    );
    return { itemId: item.id, securities: securityMap.size, holdings, investmentTransactions, skipped };
  }

  // --- helpers -------------------------------------------------------------

  private async upsertAccounts(
    itemId: string,
    accounts: InvestmentAccount[],
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

  private async upsertSecurities(securities: PlaidSecurity[], securityMap: IdMap): Promise<void> {
    // Dedupe within this sync run (each txn page repeats the same securities).
    const fresh = securities.filter((s) => !securityMap.has(s.security_id));
    if (fresh.length === 0) return;

    // One batched round-trip instead of one per security.
    const rows = await this.prisma.$transaction(
      fresh.map((s) => {
        const data = mapPlaidSecurity(s);
        return this.prisma.security.upsert({
          where: { plaidSecurityId: data.plaidSecurityId },
          create: data,
          update: {
            name: data.name,
            tickerSymbol: data.tickerSymbol,
            type: data.type,
            closePrice: data.closePrice,
            closePriceAsOf: data.closePriceAsOf,
            currency: data.currency,
            isCashEquivalent: data.isCashEquivalent,
          },
        });
      }),
    );
    rows.forEach((row, i) => securityMap.set(fresh[i].security_id, row.id));
  }

  /** Replace this item's holdings wholesale — holdings are a point-in-time snapshot. */
  private async replaceHoldings(
    accountMap: IdMap,
    securityMap: IdMap,
    plaidHoldings: Awaited<ReturnType<PlaidService["investmentsHoldings"]>>["holdings"],
  ): Promise<number> {
    const itemAccountIds = [...new Set(accountMap.values())];
    const records = plaidHoldings.flatMap((h) => {
      const accountId = accountMap.get(h.account_id);
      const securityId = securityMap.get(h.security_id);
      if (!accountId || !securityId) {
        this.logger.warn(`holding references unknown account/security; skipping`);
        return [];
      }
      return [mapPlaidHolding(accountId, securityId, h)];
    });

    await this.prisma.$transaction([
      this.prisma.holding.deleteMany({ where: { accountId: { in: itemAccountIds } } }),
      this.prisma.holding.createMany({ data: records, skipDuplicates: true }),
    ]);
    return records.length;
  }

  private async syncInvestmentTransactions(
    accessToken: string,
    itemId: string,
    accountMap: IdMap,
    securityMap: IdMap,
  ): Promise<number> {
    const end = ymd(new Date());
    const start = ymd(new Date(Date.now() - INVESTMENT_TXN_WINDOW_DAYS * 86_400_000));

    let offset = 0;
    let total = Infinity;
    let count = 0;

    while (offset < total) {
      const page = await this.plaid.investmentsTransactions(accessToken, start, end, offset);
      total = page.total_investment_transactions;

      await this.upsertAccounts(itemId, page.accounts, accountMap);
      await this.upsertSecurities(page.securities, securityMap);

      const records = page.investment_transactions.flatMap((t) => {
        const accountId = accountMap.get(t.account_id);
        if (!accountId) {
          this.logger.warn(`inv txn ${t.investment_transaction_id} references unknown account; skipping`);
          return [];
        }
        const securityId = t.security_id ? (securityMap.get(t.security_id) ?? null) : null;
        return [mapPlaidInvestmentTransaction(accountId, securityId, t)];
      });
      count += await this.batchUpsertInvestmentTxns(records);

      const got = page.investment_transactions.length;
      offset += got;
      if (got === 0) break; // safety against a stuck cursor
    }
    return count;
  }

  /** Upsert investment transactions in batched transactions (far fewer round-trips than one-by-one). */
  private async batchUpsertInvestmentTxns(
    records: ReturnType<typeof mapPlaidInvestmentTransaction>[],
  ): Promise<number> {
    const CHUNK = 100;
    for (let i = 0; i < records.length; i += CHUNK) {
      const chunk = records.slice(i, i + CHUNK);
      await this.prisma.$transaction(
        chunk.map((d) =>
          this.prisma.investmentTransaction.upsert({
            where: { plaidInvestmentTransactionId: d.plaidInvestmentTransactionId },
            create: d,
            update: d,
          }),
        ),
      );
    }
    return records.length;
  }

  /** Returns the Plaid error code if it's an expected "no investments" skip, else undefined. */
  private skipCode(err: unknown, label: string, itemId: string): string | undefined {
    const code = (err as { response?: { data?: { error_code?: string } } })?.response?.data
      ?.error_code;
    if (code && SKIPPABLE_CODES.has(code)) {
      this.logger.warn(`investments ${label} skipped for item ${itemId}: ${code}`);
      return code;
    }
    return undefined;
  }
}

/** Date -> `YYYY-MM-DD` (UTC). */
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
