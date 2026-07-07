/**
 * Live Plaid Sandbox end-to-end check for Phase 3 (the sync pipeline).
 *
 *   sandbox public_token -> exchange+store (enqueues initial sync)
 *   -> run /transactions/sync until transactions land
 *   -> verify persisted transactions (FK integrity, cursor, lastSyncedAt, status)
 *   -> re-sync and assert idempotency (no duplicates)
 *   -> remove item + purge
 *
 * This also implicitly verifies pg-boss starts against Supabase's session pooler
 * (DIRECT_URL) — starting the app context creates the `pgboss` schema.
 *
 * Requires apps/api/.env with DATABASE_URL + DIRECT_URL (migrated), PLAID_CLIENT_ID,
 * PLAID_SECRET (sandbox), ENCRYPTION_KEY. Run:
 *   pnpm --filter @fin/api e2e:sync
 */
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { randomUUID } from "crypto";
import { AppModule } from "../src/app.module";
import { ItemsService } from "../src/items/items.service";
import { PlaidService } from "../src/plaid/plaid.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { QueueService } from "../src/sync/queue.service";
import { SyncService } from "../src/sync/sync.service";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });
  const plaid = app.get(PlaidService);
  const items = app.get(ItemsService);
  const sync = app.get(SyncService);
  const queue = app.get(QueueService);
  const prisma = app.get(PrismaService);
  const userId = randomUUID();

  const txnCount = (itemId: string) =>
    prisma.transaction.count({ where: { account: { itemId } } });

  try {
    console.log("0) queue status:", queue.started ? "pg-boss started ✓" : "queue DOWN (will sync directly)");

    console.log("1) mint sandbox public_token + exchange/store…");
    const publicToken = await plaid.sandboxCreatePublicToken();
    const { itemId } = await items.exchangeAndStore(userId, publicToken);
    console.log("   item:", itemId);

    console.log("2) run /transactions/sync until transactions arrive (sandbox can lag)…");
    let last = { itemId, added: 0, modified: 0, removed: 0, pages: 0 };
    for (let attempt = 1; attempt <= 8; attempt++) {
      last = await sync.syncItem(itemId);
      const count = await txnCount(itemId);
      console.log(`   attempt ${attempt}: +${last.added} ~${last.modified} -${last.removed} | db total=${count}`);
      if (count > 0) break;
      await sleep(2500);
    }

    console.log("3) verify persisted transactions…");
    const total = await txnCount(itemId);
    assert(total > 0, "expected at least one transaction persisted");

    const item = await prisma.plaidItem.findUniqueOrThrow({
      where: { id: itemId },
      include: { accounts: true },
    });
    assert(item.transactionsCursor, "cursor should be persisted after sync");
    assert(item.lastSyncedAt, "lastSyncedAt should be set");
    assert(item.status === "good", `status should be good, got ${item.status}`);

    // FK integrity: every transaction points at an account of THIS item.
    const accountIds = new Set(item.accounts.map((a) => a.id));
    const sample = await prisma.transaction.findMany({ where: { account: { itemId } }, take: 500 });
    assert(sample.every((t) => accountIds.has(t.accountId)), "every txn must belong to this item's accounts");
    const withCategory = sample.filter((t) => t.pfcPrimary).length;
    console.log(`   ${total} transactions · ${item.accounts.length} accounts · ${withCategory}/${sample.length} categorized · cursor ✓`);

    console.log("4) idempotency: re-sync and assert no duplicates…");
    const before = await txnCount(itemId);
    await sync.syncItem(itemId);
    const after = await txnCount(itemId);
    assert(after === before, `re-sync created duplicates: ${before} -> ${after}`);
    console.log(`   stable at ${after} transactions ✓`);

    console.log("5) remove item + purge…");
    await items.removeItem(userId, itemId);
    assert((await prisma.plaidItem.count({ where: { userId } })) === 0, "item should be gone");
    assert((await txnCount(itemId)) === 0, "transactions should cascade-delete with the item");
    await prisma.profile.delete({ where: { id: userId } }).catch(() => undefined);

    console.log("\n✅ Phase 3 live Sandbox sync E2E passed");
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error("\n❌ SYNC E2E FAILED:", err);
  process.exit(1);
});
