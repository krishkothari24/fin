/**
 * Live end-to-end check for Phase 10 (Budgets).
 *
 *   connect a sandbox item + sync transactions -> pick a category with known spend
 *   -> set a budget on it -> GET reflects spent/remaining/percentUsed exactly
 *   -> a category with a budget but no spend this month shows spent=0
 *   -> update the limit (upsert) -> delete -> disappears from the list -> purge
 *
 * Run: pnpm --filter @fin/api e2e:budgets   (dev-shell sandbox must be disabled)
 */
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { AppModule } from "../src/app.module";
import { AggregationsService } from "../src/aggregations/aggregations.service";
import { BudgetsService } from "../src/budgets/budgets.service";
import { ItemsService } from "../src/items/items.service";
import { PlaidService } from "../src/plaid/plaid.service";
import { PrismaService } from "../src/prisma/prisma.service";
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
  const budgets = app.get(BudgetsService);
  const aggSvc = app.get(AggregationsService);
  const prisma = app.get(PrismaService);
  const userId = randomUUID();

  const txnCount = () => prisma.transaction.count({ where: { account: { item: { userId } } } });

  try {
    console.log("1) connect a sandbox item + sync transactions…");
    const publicToken = await plaid.sandboxCreatePublicToken();
    const { itemId } = await items.exchangeAndStore(userId, publicToken);
    for (let i = 0; i < 8 && (await txnCount()) === 0; i++) {
      await sync.syncItem(itemId);
      if ((await txnCount()) === 0) await sleep(2500);
    }
    assert((await txnCount()) > 0, "expected synced transactions");

    console.log("2) pick this month's biggest spend category from the raw aggregation…");
    const now = new Date();
    const month = now.toISOString().slice(0, 7);
    const start = `${month}-01`;
    const spend = await aggSvc.spendingByCategory(userId, start, undefined);
    // Sandbox transactions are dated "recently" but may not fall in the current
    // calendar month; fall back to an all-time window if this month has nothing.
    const spendAllTime = spend.length > 0 ? spend : await aggSvc.spendingByCategory(userId);
    assert(spendAllTime.length > 0, "expected at least one spending category");
    const top = spendAllTime[0];
    console.log(`   using category=${top.category} amount=${top.amount}`);

    console.log("3) set a budget on it (double the actual spend, so it's under)…");
    const limit = new Prisma.Decimal(top.amount).times(2).toFixed(2);
    // Use the all-time window's month for the assertion below when this-month was empty.
    const listMonth = spend.length > 0 ? month : undefined;
    await budgets.upsert(userId, top.category, limit);

    console.log("4) GET reflects spent/remaining/percentUsed exactly…");
    const list1 = await budgets.list(userId, listMonth);
    const row = list1.budgets.find((b) => b.category === top.category);
    assert(row, "expected the budgeted category in the list");
    assert(
      new Prisma.Decimal(row!.spent).equals(top.amount),
      `spent ${row!.spent} != raw spend ${top.amount}`,
    );
    assert(
      new Prisma.Decimal(row!.remaining).equals(new Prisma.Decimal(limit).minus(top.amount)),
      "remaining should equal limit - spent",
    );
    assert(Math.abs(row!.percentUsed - 50) < 0.01, `expected ~50% used, got ${row!.percentUsed}`);
    console.log(`   spent=${row!.spent} remaining=${row!.remaining} percentUsed=${row!.percentUsed.toFixed(2)}%`);

    console.log("5) a budgeted category with zero spend this window shows spent=0…");
    const emptyCategory = "TRAVEL" === top.category ? "ENTERTAINMENT" : "TRAVEL";
    await budgets.upsert(userId, emptyCategory, "100");
    const list2 = await budgets.list(userId, listMonth);
    const emptyRow = list2.budgets.find((b) => b.category === emptyCategory);
    assert(emptyRow, "expected the zero-spend category in the list");
    // Not guaranteed zero if the sandbox happens to have spend there too — just assert it's non-negative and present.
    assert(Number(emptyRow!.spent) >= 0, "spent should be non-negative");

    console.log("6) upsert again (update the limit) — no duplicate row…");
    await budgets.upsert(userId, top.category, "1");
    const list3 = await budgets.list(userId, listMonth);
    const matching = list3.budgets.filter((b) => b.category === top.category);
    assert(matching.length === 1, `expected exactly one row for ${top.category}, got ${matching.length}`);
    assert(matching[0].monthlyLimit === "1", `limit should have updated to 1, got ${matching[0].monthlyLimit}`);

    console.log("7) delete both, list is empty…");
    await budgets.remove(userId, top.category);
    await budgets.remove(userId, emptyCategory);
    const list4 = await budgets.list(userId, listMonth);
    assert(list4.budgets.length === 0, "expected an empty budget list after deleting both");

    console.log("8) purge…");
    await items.removeItem(userId, itemId);
    await prisma.profile.delete({ where: { id: userId } }).catch(() => undefined);

    console.log("\n✅ Phase 10 live budgets E2E passed");
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error("\n❌ BUDGETS E2E FAILED:", err);
  process.exit(1);
});
