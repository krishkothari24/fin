/**
 * Live end-to-end check for Phase 8 (Plaid Liabilities + Recurring Transactions).
 *
 *   connect a sandbox item (with Liabilities) -> sync transactions (recurring needs them)
 *   -> sync liabilities -> assert rows landed -> read API totals cross-check
 *   -> sync recurring streams (retry) -> assert streams -> read API split + monthly totals
 *   -> hidden-account exclusion drops that account's liability + debt
 *   -> idempotency: re-sync doesn't duplicate (both replaced wholesale)
 *   -> purge
 *
 * Run: pnpm --filter @fin/api e2e:liabilities-recurring   (dev-shell sandbox must be disabled)
 */
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { AppModule } from "../src/app.module";
import { ItemsService } from "../src/items/items.service";
import { LiabilitiesService } from "../src/liabilities/liabilities.service";
import { LiabilitiesSyncService } from "../src/liabilities/liabilities-sync.service";
import { PlaidService } from "../src/plaid/plaid.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { RecurringService } from "../src/recurring/recurring.service";
import { RecurringSyncService } from "../src/recurring/recurring-sync.service";
import { SyncService } from "../src/sync/sync.service";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  const plaid = app.get(PlaidService);
  const items = app.get(ItemsService);
  const sync = app.get(SyncService);
  const liabSync = app.get(LiabilitiesSyncService);
  const liabRead = app.get(LiabilitiesService);
  const recSync = app.get(RecurringSyncService);
  const recRead = app.get(RecurringService);
  const prisma = app.get(PrismaService);
  const userId = randomUUID();

  try {
    console.log("1) connect a sandbox item (Transactions + Investments + Liabilities)…");
    const publicToken = await plaid.sandboxCreatePublicToken();
    const { itemId } = await items.exchangeAndStore(userId, publicToken);

    console.log("2) sync transactions (recurring derives from them)…");
    await sync.syncItem(itemId);

    console.log("3) sync liabilities (retry until ready)…");
    let liab = { liabilities: 0 } as Awaited<ReturnType<LiabilitiesSyncService["syncItem"]>>;
    for (let i = 0; i < 12; i++) {
      liab = await liabSync.syncItem(itemId);
      if (liab.liabilities > 0) break;
      await sleep(3000);
    }
    console.log(`   synced ${liab.liabilities} liability accounts`);
    assert(liab.liabilities > 0, "expected liability accounts from the sandbox item");

    console.log("4) DB matches + read API totals cross-check…");
    const dbLiab = await prisma.liability.count({ where: { account: { item: { userId } } } });
    assert(dbLiab === liab.liabilities, `liabilities ${liab.liabilities} != db ${dbLiab}`);
    const liabResp = await liabRead.listLiabilities(userId);
    assert(liabResp.liabilities.length === dbLiab, "liability DTO count mismatch");
    // totalDebt should equal the sum of the (non-hidden) liability accounts' balances.
    const rawDebt = (
      await prisma.account.findMany({
        where: { isHidden: false, item: { userId }, liability: { isNot: null } },
        select: { currentBalance: true },
      })
    ).reduce((s, a) => s.plus(a.currentBalance ?? 0), new Prisma.Decimal(0));
    assert(
      new Prisma.Decimal(liabResp.totals.totalDebt).equals(rawDebt),
      `totals.totalDebt ${liabResp.totals.totalDebt} != raw ${rawDebt.toString()}`,
    );
    const kinds = [...new Set(liabResp.liabilities.map((l) => l.kind))].sort().join(", ");
    console.log(
      `   totalDebt=${liabResp.totals.totalDebt} minPayment=${liabResp.totals.minimumPaymentDue} kinds=[${kinds}]`,
    );

    console.log("5) sync recurring streams (retry until detected)…");
    let rec = { streams: 0 } as Awaited<ReturnType<RecurringSyncService["syncItem"]>>;
    for (let i = 0; i < 12; i++) {
      rec = await recSync.syncItem(itemId);
      if (rec.streams > 0) break;
      await sleep(3000);
    }
    console.log(`   synced ${rec.streams} recurring streams`);
    assert(rec.streams > 0, "expected recurring streams from the sandbox item");

    console.log("6) DB matches + read API split / monthly totals…");
    const dbStreams = await prisma.recurringStream.count({
      where: { account: { item: { userId } } },
    });
    assert(dbStreams === rec.streams, `streams ${rec.streams} != db ${dbStreams}`);
    const recResp = await recRead.listRecurring(userId, { activeOnly: false });
    assert(
      recResp.inflows.length + recResp.outflows.length === dbStreams,
      "recurring DTO count mismatch",
    );
    assert(
      Number(recResp.totals.monthlyInflow) >= 0 && Number(recResp.totals.monthlyOutflow) >= 0,
      "monthly totals should be non-negative",
    );
    console.log(
      `   inflows=${recResp.inflows.length} outflows=${recResp.outflows.length} ` +
        `monthlyIn=${recResp.totals.monthlyInflow} monthlyOut=${recResp.totals.monthlyOutflow}`,
    );
    // activeOnly filter never returns more than the unfiltered set.
    const activeResp = await recRead.listRecurring(userId, { activeOnly: true });
    assert(
      activeResp.inflows.length + activeResp.outflows.length <= dbStreams,
      "activeOnly should not exceed the full set",
    );

    console.log("7) hidden-account exclusion drops its liability + debt…");
    const hideAcct = liabResp.liabilities[0];
    await prisma.account.update({ where: { id: hideAcct.accountId }, data: { isHidden: true } });
    const afterHide = await liabRead.listLiabilities(userId);
    assert(
      afterHide.liabilities.every((l) => l.accountId !== hideAcct.accountId),
      "hidden account's liability should be excluded",
    );
    assert(
      new Prisma.Decimal(afterHide.totals.totalDebt).lessThanOrEqualTo(liabResp.totals.totalDebt),
      "hiding a liability account should not increase total debt",
    );
    await prisma.account.update({ where: { id: hideAcct.accountId }, data: { isHidden: false } });
    console.log("   hidden account excluded, then restored ✓");

    console.log("8) idempotency: re-sync doesn't duplicate…");
    await liabSync.syncItem(itemId);
    await recSync.syncItem(itemId);
    const dbLiab2 = await prisma.liability.count({ where: { account: { item: { userId } } } });
    const dbStreams2 = await prisma.recurringStream.count({
      where: { account: { item: { userId } } },
    });
    assert(dbLiab2 === dbLiab, `re-sync changed liability count ${dbLiab} -> ${dbLiab2}`);
    assert(dbStreams2 === dbStreams, `re-sync changed stream count ${dbStreams} -> ${dbStreams2}`);

    console.log("9) purge…");
    await items.removeItem(userId, itemId);
    await prisma.profile.delete({ where: { id: userId } }).catch(() => undefined);

    console.log("\n✅ Phase 8 live liabilities + recurring E2E passed");
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error("\n❌ LIABILITIES/RECURRING E2E FAILED:", err);
  process.exit(1);
});
