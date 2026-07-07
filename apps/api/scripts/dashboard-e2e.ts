/**
 * Live end-to-end check for Phase 5 (dashboard config + balance snapshots).
 *
 *   GET config (no row) -> DEFAULT_DASHBOARD_CONFIG
 *   PUT a modified config -> GET returns it
 *   connect + sync -> snapshot balances -> net-worth series is now non-empty
 *   and today's series point equals the current net worth
 *   -> purge
 *
 * Run: pnpm --filter @fin/api e2e:dashboard   (dev-shell sandbox must be disabled)
 */
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { DEFAULT_DASHBOARD_CONFIG } from "@fin/shared";
import { AppModule } from "../src/app.module";
import { AggregationsService } from "../src/aggregations/aggregations.service";
import { DashboardService } from "../src/dashboard/dashboard.service";
import { ItemsService } from "../src/items/items.service";
import { PlaidService } from "../src/plaid/plaid.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { SnapshotService } from "../src/sync/snapshot.service";
import { SyncService } from "../src/sync/sync.service";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Postgres jsonb reorders object keys, so compare structurally (order-insensitive).
function canon(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(canon);
  if (x && typeof x === "object") {
    const src = x as Record<string, unknown>;
    return Object.keys(src)
      .sort()
      .reduce<Record<string, unknown>>((o, k) => ((o[k] = canon(src[k])), o), {});
  }
  return x;
}
const eq = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  const plaid = app.get(PlaidService);
  const items = app.get(ItemsService);
  const sync = app.get(SyncService);
  const prisma = app.get(PrismaService);
  const dashboard = app.get(DashboardService);
  const snapshots = app.get(SnapshotService);
  const aggSvc = app.get(AggregationsService);
  const userId = randomUUID();

  const txnCount = (itemId: string) => prisma.transaction.count({ where: { account: { itemId } } });

  try {
    console.log("1) GET config with no saved row -> defaults…");
    const def = await dashboard.getConfig(userId);
    assert(eq(def, DEFAULT_DASHBOARD_CONFIG), "expected DEFAULT_DASHBOARD_CONFIG");

    console.log("2) PUT a modified config, then GET it back…");
    const custom = {
      ...DEFAULT_DASHBOARD_CONFIG,
      defaultRangeDays: 90,
      currency: "USD",
      widgets: DEFAULT_DASHBOARD_CONFIG.widgets.map((w) =>
        w.id === "recurring" ? { ...w, enabled: true } : w,
      ),
    };
    await dashboard.putConfig(userId, custom);
    const roundTrip = await dashboard.getConfig(userId);
    assert(eq(roundTrip, custom), "GET should return the config we PUT");
    console.log(`   saved: defaultRangeDays=${roundTrip.defaultRangeDays}, recurring enabled ✓`);

    console.log("3) connect + sync (need accounts with balances)…");
    const publicToken = await plaid.sandboxCreatePublicToken();
    const { itemId } = await items.exchangeAndStore(userId, publicToken);
    for (let i = 0; i < 8 && (await txnCount(itemId)) === 0; i++) {
      await sync.syncItem(itemId);
      if ((await txnCount(itemId)) === 0) await sleep(2500);
    }
    const accountCount = await prisma.account.count({ where: { itemId } });
    assert(accountCount > 0, "expected accounts");

    console.log("4) snapshot balances (the daily job, run directly)…");
    await snapshots.snapshotAllBalances();
    const snaps = await prisma.balanceSnapshot.count({ where: { account: { item: { userId } } } });
    assert(snaps === accountCount, `expected one snapshot per account (${accountCount}), got ${snaps}`);
    console.log(`   ${snaps} snapshots written`);

    console.log("5) net-worth series is now non-empty and matches current…");
    const nw = await aggSvc.netWorth(userId, true);
    assert(nw.series && nw.series.length >= 1, "series should be non-empty after a snapshot");
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayPoint = nw.series!.find((p) => p.date === todayStr);
    assert(todayPoint, "today's snapshot should appear in the series");
    assert(
      new Prisma.Decimal(todayPoint!.netWorth).equals(nw.netWorth),
      `series net (${todayPoint!.netWorth}) should equal current net worth (${nw.netWorth})`,
    );
    console.log(`   series[${todayStr}] net=${todayPoint!.netWorth} == current ${nw.netWorth} ✓`);

    console.log("6) idempotency: re-snapshot, count unchanged…");
    await snapshots.snapshotAllBalances();
    const snaps2 = await prisma.balanceSnapshot.count({ where: { account: { item: { userId } } } });
    assert(snaps2 === snaps, `re-snapshot must not duplicate (${snaps} -> ${snaps2})`);

    console.log("7) purge…");
    await items.removeItem(userId, itemId);
    await prisma.profile.delete({ where: { id: userId } }).catch(() => undefined);

    console.log("\n✅ Phase 5 live dashboard/snapshot E2E passed");
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error("\n❌ DASHBOARD E2E FAILED:", err);
  process.exit(1);
});
