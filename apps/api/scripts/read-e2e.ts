/**
 * Live Plaid Sandbox end-to-end check for Phase 4 (read & aggregation API).
 *
 *   connect + sync (seed real transactions)
 *   -> accounts list (institution names, decimals as strings)
 *   -> transactions list (pagination, category filter, search)
 *   -> net worth (assets − liabilities, cross-checked; hidden-account exclusion)
 *   -> spending by category (sum matches raw positive-amount total)
 *   -> cash flow (net = income − outflow)
 *   -> purge
 *
 * Run: pnpm --filter @fin/api e2e:read   (dev-shell sandbox must be disabled)
 */
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { AppModule } from "../src/app.module";
import { AccountsService } from "../src/accounts/accounts.service";
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
const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  const plaid = app.get(PlaidService);
  const items = app.get(ItemsService);
  const sync = app.get(SyncService);
  const prisma = app.get(PrismaService);
  const accountsSvc = app.get(AccountsService);
  const txnsSvc = app.get(TransactionsService);
  const aggSvc = app.get(AggregationsService);
  const userId = randomUUID();

  const txnCount = (itemId: string) => prisma.transaction.count({ where: { account: { itemId } } });

  try {
    console.log("1) connect + sync (seed transactions)…");
    const publicToken = await plaid.sandboxCreatePublicToken();
    const { itemId } = await items.exchangeAndStore(userId, publicToken);
    for (let i = 0; i < 8 && (await txnCount(itemId)) === 0; i++) {
      await sync.syncItem(itemId);
      if ((await txnCount(itemId)) === 0) await sleep(2500);
    }
    assert((await txnCount(itemId)) > 0, "expected seeded transactions");

    console.log("2) accounts list…");
    const accounts = await accountsSvc.list(userId);
    assert(accounts.length > 0, "expected accounts");
    assert(accounts.every((a) => a.institutionName === "First Platypus Bank"), "institution name attached");
    assert(accounts.every((a) => a.currentBalance === null || typeof a.currentBalance === "string"), "balances are strings");
    console.log(`   ${accounts.length} accounts`);

    console.log("3) transactions list (pagination + filters)…");
    const page = await txnsSvc.list(userId, { limit: 5, offset: 0 } as never);
    assert(page.transactions.length <= 5, "limit respected");
    assert(page.total >= page.transactions.length, "total >= page size");
    // newest-first ordering
    const dates = page.transactions.map((t) => t.date);
    assert([...dates].sort().reverse().join() === dates.join(), "sorted date desc");
    // category filter
    const spending = await aggSvc.spendingByCategory(userId);
    assert(spending.length > 0, "expected spending categories");
    const cat = spending[0].category;
    const filtered = await txnsSvc.list(userId, { limit: 200, offset: 0, category: cat } as never);
    assert(filtered.transactions.every((t) => t.category.primary === cat), `all filtered txns are ${cat}`);
    console.log(`   total=${page.total}, top category=${cat} (${filtered.total} txns)`);

    console.log("4) net worth (assets − liabilities) + cross-check…");
    const nw = await aggSvc.netWorth(userId, true);
    assert(D(nw.assets).minus(nw.liabilities).equals(nw.netWorth), "netWorth = assets − liabilities");
    const rawAssets = await prisma.account.aggregate({
      where: { item: { userId }, isHidden: false, type: { in: ["depository", "investment"] } },
      _sum: { currentBalance: true },
    });
    assert(D(rawAssets._sum.currentBalance ?? 0).equals(nw.assets), "assets match raw sum");
    assert(Array.isArray(nw.series), "series present (may be empty pre-Phase-5)");
    console.log(`   assets=${nw.assets} liabilities=${nw.liabilities} net=${nw.netWorth} series=${nw.series?.length ?? 0}`);

    console.log("5) hidden-account exclusion…");
    const asset = accounts.find((a) => ["depository", "investment"].includes(a.type) && a.currentBalance);
    assert(asset, "need an asset account with a balance to test hiding");
    await accountsSvc.update(userId, asset.id, { isHidden: true });
    const nw2 = await aggSvc.netWorth(userId, false);
    assert(D(nw.assets).minus(asset.currentBalance!).equals(nw2.assets), "hiding an asset lowers assets by its balance");
    await accountsSvc.update(userId, asset.id, { isHidden: false });
    console.log(`   hid ${asset.name} (${asset.currentBalance}) -> assets ${nw.assets} → ${nw2.assets} ✓`);

    console.log("6) spending sum matches raw positive-amount total…");
    const spendTotal = spending.reduce((s, c) => s.plus(c.amount), D(0));
    const rawOut = await prisma.transaction.aggregate({
      where: { account: { item: { userId }, isHidden: false }, pending: false, amount: { gt: 0 } },
      _sum: { amount: true },
    });
    assert(spendTotal.equals(D(rawOut._sum.amount ?? 0)), "spending-by-category sums to raw outflow");
    console.log(`   spending total=${spendTotal.toString()} across ${spending.length} categories`);

    console.log("7) cash flow (net = income − outflow)…");
    const cf = await aggSvc.cashFlow(userId);
    assert(cf.length > 0, "expected at least one month of cash flow");
    assert(cf.every((m) => D(m.income).minus(m.outflow).equals(m.net)), "net = income − outflow each month");
    console.log(`   ${cf.length} month(s), e.g. ${cf[0].month}: in=${cf[0].income} out=${cf[0].outflow} net=${cf[0].net}`);

    console.log("8) purge…");
    await items.removeItem(userId, itemId);
    await prisma.profile.delete({ where: { id: userId } }).catch(() => undefined);

    console.log("\n✅ Phase 4 live read/aggregation E2E passed");
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error("\n❌ READ E2E FAILED:", err);
  process.exit(1);
});
