/**
 * Live end-to-end check for Phase 7 (Plaid Investments).
 *
 *   connect a sandbox item (with Investments) -> sync holdings + investment txns
 *   -> assert securities/holdings/txns landed
 *   -> read API: holdings totals cross-check + investment-transactions page
 *   -> hidden-account exclusion drops that account's holdings + value
 *   -> idempotency: re-sync doesn't duplicate (holdings replaced, txns upserted)
 *   -> purge
 *
 * Run: pnpm --filter @fin/api e2e:investments   (dev-shell sandbox must be disabled)
 */
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { AppModule } from "../src/app.module";
import { InvestmentsService } from "../src/investments/investments.service";
import { InvestmentsSyncService } from "../src/investments/investments-sync.service";
import { ItemsService } from "../src/items/items.service";
import { PlaidService } from "../src/plaid/plaid.service";
import { PrismaService } from "../src/prisma/prisma.service";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  const plaid = app.get(PlaidService);
  const items = app.get(ItemsService);
  const invSync = app.get(InvestmentsSyncService);
  const invRead = app.get(InvestmentsService);
  const prisma = app.get(PrismaService);
  const userId = randomUUID();

  try {
    console.log("1) connect a sandbox item (Transactions + Investments)…");
    const publicToken = await plaid.sandboxCreatePublicToken();
    const { itemId } = await items.exchangeAndStore(userId, publicToken);

    console.log("2) sync investments (retry until holdings + investment txns are ready)…");
    let last = { securities: 0, holdings: 0, investmentTransactions: 0 } as Awaited<
      ReturnType<InvestmentsSyncService["syncItem"]>
    >;
    for (let i = 0; i < 12; i++) {
      last = await invSync.syncItem(itemId);
      if (last.holdings > 0 && last.investmentTransactions > 0) break;
      await sleep(3000);
    }
    console.log(
      `   synced: ${last.securities} securities, ${last.holdings} holdings, ${last.investmentTransactions} investment txns`,
    );
    assert(last.holdings > 0, "expected holdings from the sandbox item");
    assert(last.securities > 0, "expected securities");
    assert(last.investmentTransactions > 0, "expected investment transactions");

    console.log("3) DB matches the sync result…");
    const dbHoldings = await prisma.holding.count({
      where: { account: { item: { userId } } },
    });
    const dbInvTxns = await prisma.investmentTransaction.count({
      where: { account: { item: { userId } } },
    });
    assert(dbHoldings === last.holdings, `holdings ${last.holdings} != db ${dbHoldings}`);
    assert(dbInvTxns === last.investmentTransactions, `txns ${last.investmentTransactions} != db ${dbInvTxns}`);

    console.log("4) read API: holdings totals cross-check…");
    const holdingsResp = await invRead.listHoldings(userId);
    assert(holdingsResp.holdings.length === dbHoldings, "holdings DTO count mismatch");
    // Recompute the value total from raw rows and compare to the API's total.
    const rawValue = (
      await prisma.holding.findMany({
        where: { account: { isHidden: false, item: { userId } } },
        select: { institutionValue: true },
      })
    ).reduce((s, h) => s.plus(h.institutionValue ?? 0), new Prisma.Decimal(0));
    assert(
      new Prisma.Decimal(holdingsResp.totals.value).equals(rawValue),
      `totals.value ${holdingsResp.totals.value} != raw ${rawValue.toString()}`,
    );
    // gainLoss = value - costBasis (identity check).
    assert(
      new Prisma.Decimal(holdingsResp.totals.gainLoss).equals(
        new Prisma.Decimal(holdingsResp.totals.value).minus(holdingsResp.totals.costBasis),
      ),
      "totals.gainLoss should equal value - costBasis",
    );
    console.log(
      `   portfolio value=${holdingsResp.totals.value} costBasis=${holdingsResp.totals.costBasis} gain/loss=${holdingsResp.totals.gainLoss}`,
    );

    console.log("5) read API: investment transactions page…");
    const txnPage = await invRead.listInvestmentTransactions(userId, { limit: 200, offset: 0 } as never);
    assert(txnPage.total === dbInvTxns, `txn page total ${txnPage.total} != db ${dbInvTxns}`);
    assert(txnPage.transactions.length > 0, "expected some investment transactions in the page");
    console.log(`   ${txnPage.total} investment transactions; first: ${txnPage.transactions[0]?.name}`);

    console.log("6) hidden-account exclusion drops its holdings + value…");
    const acctWithHolding = await prisma.holding.findFirst({
      where: { account: { isHidden: false, item: { userId } } },
      select: { accountId: true, institutionValue: true },
    });
    assert(acctWithHolding, "expected at least one held account");
    await prisma.account.update({
      where: { id: acctWithHolding!.accountId },
      data: { isHidden: true },
    });
    const afterHide = await invRead.listHoldings(userId);
    assert(
      afterHide.holdings.every((h) => h.accountId !== acctWithHolding!.accountId),
      "hidden account's holdings should be excluded",
    );
    assert(
      new Prisma.Decimal(afterHide.totals.value).lessThan(holdingsResp.totals.value),
      "hiding a held account should reduce the portfolio value",
    );
    await prisma.account.update({
      where: { id: acctWithHolding!.accountId },
      data: { isHidden: false },
    });
    console.log("   hidden account excluded; value dropped, then restored ✓");

    console.log("7) idempotency: re-sync doesn't duplicate…");
    const again = await invSync.syncItem(itemId);
    const dbHoldings2 = await prisma.holding.count({ where: { account: { item: { userId } } } });
    const dbInvTxns2 = await prisma.investmentTransaction.count({
      where: { account: { item: { userId } } },
    });
    assert(dbHoldings2 === dbHoldings, `re-sync changed holdings count ${dbHoldings} -> ${dbHoldings2}`);
    assert(dbInvTxns2 === dbInvTxns, `re-sync changed txn count ${dbInvTxns} -> ${dbInvTxns2}`);
    assert(again.holdings === last.holdings, "re-sync holdings snapshot should be stable");

    console.log("8) purge…");
    await items.removeItem(userId, itemId);
    await prisma.profile.delete({ where: { id: userId } }).catch(() => undefined);
    // securities are shared/global (not user-scoped) — intentionally left in place.

    console.log("\n✅ Phase 7 live investments E2E passed");
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error("\n❌ INVESTMENTS E2E FAILED:", err);
  process.exit(1);
});
