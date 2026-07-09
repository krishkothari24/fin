/**
 * Live end-to-end check for Phase 11 (transaction notes/tags/category overrides/splits).
 *
 *   connect a sandbox item + sync -> PATCH a note/tags/category override onto one
 *   transaction -> read API reflects it, category filter matches the override
 *   -> spendingByCategory reflects the override -> resync doesn't clobber it
 *   (the core guarantee this phase depends on) -> PUT splits that don't sum to the
 *   amount is rejected -> PUT splits that do sum is accepted and read back
 *   -> DELETE splits clears them -> purge
 *
 * Run: pnpm --filter @fin/api e2e:transaction-details   (dev-shell sandbox must be disabled)
 */
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { AppModule } from "../src/app.module";
import { AggregationsService } from "../src/aggregations/aggregations.service";
import { ItemsService } from "../src/items/items.service";
import { PlaidService } from "../src/plaid/plaid.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { SyncService } from "../src/sync/sync.service";
import { TransactionsService } from "../src/transactions/transactions.service";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  const plaid = app.get(PlaidService);
  const items = app.get(ItemsService);
  const sync = app.get(SyncService);
  const transactions = app.get(TransactionsService);
  const aggSvc = app.get(AggregationsService);
  const prisma = app.get(PrismaService);
  const userId = randomUUID();

  const txnCount = (itemId: string) => prisma.transaction.count({ where: { account: { itemId } } });

  try {
    console.log("1) connect a sandbox item + sync transactions…");
    const publicToken = await plaid.sandboxCreatePublicToken();
    const { itemId } = await items.exchangeAndStore(userId, publicToken);
    for (let i = 0; i < 8 && (await txnCount(itemId)) === 0; i++) {
      await sync.syncItem(itemId);
      if ((await txnCount(itemId)) === 0) await sleep(2500);
    }
    assert((await txnCount(itemId)) > 0, "expected synced transactions");

    console.log("2) pick a real, non-pending, positive-amount transaction…");
    const list0 = await transactions.list(userId, { limit: 200, offset: 0, pending: false } as never);
    const target = list0.transactions.find((t) => Number(t.amount) > 0);
    assert(target, "expected at least one positive-amount transaction");
    const originalCategory = target!.category.primary;
    const overrideCategory = originalCategory === "ENTERTAINMENT" ? "TRAVEL" : "ENTERTAINMENT";
    console.log(`   using txn ${target!.id}, amount=${target!.amount}, category=${originalCategory} -> ${overrideCategory}`);

    console.log("3) PATCH note/tags/category override…");
    const patched = await transactions.updateDetail(userId, target!.id, {
      note: "verified by e2e",
      categoryOverride: overrideCategory,
      tags: ["e2e", "verify"],
    });
    assert(patched.note === "verified by e2e", "note should round-trip");
    assert(patched.category.primary === overrideCategory, "category.primary should reflect the override");
    assert(patched.tags.sort().join(",") === "e2e,verify", "tags should round-trip");

    console.log("4) read API + category filter reflect the override…");
    const byOverrideCategory = await transactions.list(userId, {
      limit: 50,
      offset: 0,
      category: overrideCategory,
    } as never);
    assert(
      byOverrideCategory.transactions.some((t) => t.id === target!.id),
      "filtering by the override category should still find the transaction",
    );
    const byTag = await transactions.list(userId, { limit: 50, offset: 0, tags: ["verify"] } as never);
    assert(byTag.transactions.some((t) => t.id === target!.id), "filtering by tag should find the transaction");

    console.log("5) spendingByCategory reflects the override…");
    const spend = await aggSvc.spendingByCategory(userId);
    const overrideBucket = spend.find((s) => s.category === overrideCategory);
    assert(overrideBucket, "expected the override category to appear in spendingByCategory");
    assert(Number(overrideBucket!.amount) >= Number(target!.amount), "override bucket should include the moved amount");

    console.log("6) resync doesn't clobber the note/tags/override (the core guarantee)…");
    await sync.syncItem(itemId);
    const afterResync = await transactions.list(userId, { limit: 200, offset: 0 } as never);
    const stillThere = afterResync.transactions.find((t) => t.id === target!.id);
    assert(stillThere, "transaction should still exist after resync");
    assert(stillThere!.note === "verified by e2e", "note must survive a resync");
    assert(stillThere!.category.primary === overrideCategory, "category override must survive a resync");
    assert(stillThere!.tags.length === 2, "tags must survive a resync");

    console.log("7) splits that don't sum to the amount are rejected…");
    let rejected = false;
    try {
      await transactions.setSplits(userId, target!.id, {
        splits: [{ amount: "1.00" }, { amount: "1.00" }],
      });
    } catch {
      rejected = true;
    }
    assert(rejected, "mismatched split amounts should be rejected");

    console.log("8) splits that do sum are accepted and read back…");
    const half = new Prisma.Decimal(target!.amount).dividedBy(2).toFixed(2);
    const remainder = new Prisma.Decimal(target!.amount).minus(half).toFixed(2);
    const withSplits = await transactions.setSplits(userId, target!.id, {
      splits: [
        { amount: half, category: "FOOD_AND_DRINK", note: "half" },
        { amount: remainder, category: "ENTERTAINMENT" },
      ],
    });
    assert(withSplits.splits.length === 2, `expected 2 splits, got ${withSplits.splits.length}`);
    const splitSum = withSplits.splits.reduce((s, sp) => s.plus(sp.amount), new Prisma.Decimal(0));
    assert(splitSum.equals(target!.amount), "split amounts should sum back to the transaction amount");

    console.log("9) clearing splits removes them…");
    const cleared = await transactions.clearSplits(userId, target!.id);
    assert(cleared.splits.length === 0, "expected zero splits after clearing");

    console.log("10) purge…");
    await items.removeItem(userId, itemId);
    await prisma.profile.delete({ where: { id: userId } }).catch(() => undefined);

    console.log("\n✅ Phase 11 live transaction-details E2E passed");
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error("\n❌ TRANSACTION DETAILS E2E FAILED:", err);
  process.exit(1);
});
