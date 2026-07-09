/**
 * Live end-to-end check for Phase 9 (Manual Assets & Liabilities).
 *
 *   create a manual asset with no Plaid item connected yet (Profile auto-created)
 *   -> list splits by kind + totals -> update -> connect a sandbox item + sync
 *   -> net worth shifts by exactly (manual assets - manual liabilities)
 *   -> delete -> net worth reverts -> ownership check -> purge
 *
 * Run: pnpm --filter @fin/api e2e:manual-assets   (dev-shell sandbox must be disabled)
 */
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { AppModule } from "../src/app.module";
import { AggregationsService } from "../src/aggregations/aggregations.service";
import { ItemsService } from "../src/items/items.service";
import { ManualAssetsService } from "../src/manual-assets/manual-assets.service";
import { PlaidService } from "../src/plaid/plaid.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { SyncService } from "../src/sync/sync.service";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  const manualAssets = app.get(ManualAssetsService);
  const plaid = app.get(PlaidService);
  const items = app.get(ItemsService);
  const sync = app.get(SyncService);
  const aggSvc = app.get(AggregationsService);
  const prisma = app.get(PrismaService);
  const userId = randomUUID();
  const otherUserId = randomUUID();

  try {
    console.log("1) create a manual asset with no Profile row yet (ensureProfile)…");
    const house = await manualAssets.create(userId, {
      name: "Rental House",
      kind: "asset",
      category: "real_estate",
      currentValue: "450000",
    });
    const profile = await prisma.profile.findUnique({ where: { id: userId } });
    assert(profile, "Profile row should have been auto-created");
    assert(house.currentValue === "450000", "currentValue should round-trip");

    console.log("2) create a manual liability…");
    const loan = await manualAssets.create(userId, {
      name: "Personal Loan",
      kind: "liability",
      category: "loan",
      currentValue: "12000",
    });

    console.log("3) list splits by kind, totals correct…");
    const list1 = await manualAssets.list(userId);
    assert(list1.assets.length === 1 && list1.assets[0].id === house.id, "assets list mismatch");
    assert(list1.liabilities.length === 1 && list1.liabilities[0].id === loan.id, "liabilities list mismatch");
    assert(list1.totals.assetsValue === "450000", `assetsValue ${list1.totals.assetsValue}`);
    assert(list1.totals.liabilitiesValue === "12000", `liabilitiesValue ${list1.totals.liabilitiesValue}`);

    console.log("4) net worth (no Plaid items yet) reflects manual entries exactly…");
    const nwBefore = await aggSvc.netWorth(userId, false);
    assert(nwBefore.assets === "450000", `assets ${nwBefore.assets}`);
    assert(nwBefore.liabilities === "12000", `liabilities ${nwBefore.liabilities}`);
    assert(
      new Prisma.Decimal(nwBefore.netWorth).equals("438000"),
      `netWorth ${nwBefore.netWorth} != 438000`,
    );

    console.log("5) connect a sandbox Plaid item + sync, net worth shifts by manual net exactly…");
    const publicToken = await plaid.sandboxCreatePublicToken();
    const { itemId } = await items.exchangeAndStore(userId, publicToken);
    await sync.syncItem(itemId);
    const plaidOnlyAssets = await prisma.account.aggregate({
      where: { item: { userId }, isHidden: false, type: { in: ["depository", "investment"] } },
      _sum: { currentBalance: true },
    });
    const plaidOnlyLiab = await prisma.account.aggregate({
      where: { item: { userId }, isHidden: false, type: { in: ["credit", "loan"] } },
      _sum: { currentBalance: true },
    });
    const nwAfter = await aggSvc.netWorth(userId, false);
    const expectedAssets = (plaidOnlyAssets._sum.currentBalance ?? new Prisma.Decimal(0)).plus(450000);
    const expectedLiab = (plaidOnlyLiab._sum.currentBalance ?? new Prisma.Decimal(0)).plus(12000);
    assert(
      new Prisma.Decimal(nwAfter.assets).equals(expectedAssets),
      `assets ${nwAfter.assets} != expected ${expectedAssets.toString()}`,
    );
    assert(
      new Prisma.Decimal(nwAfter.liabilities).equals(expectedLiab),
      `liabilities ${nwAfter.liabilities} != expected ${expectedLiab.toString()}`,
    );
    console.log(`   assets=${nwAfter.assets} liabilities=${nwAfter.liabilities} ✓`);

    console.log("6) update the asset's value, net worth shifts accordingly…");
    await manualAssets.update(userId, house.id, { currentValue: "460000" });
    const nwAfterUpdate = await aggSvc.netWorth(userId, false);
    assert(
      new Prisma.Decimal(nwAfterUpdate.assets).equals(expectedAssets.plus(10000)),
      "asset update should shift net worth by exactly the delta",
    );

    console.log("7) ownership check: another user cannot update/delete this asset…");
    let threw = false;
    try {
      await manualAssets.update(otherUserId, house.id, { currentValue: "1" });
    } catch {
      threw = true;
    }
    assert(threw, "updating another user's manual asset should throw NotFoundException");

    console.log("8) delete both, net worth reverts to Plaid-only…");
    await manualAssets.remove(userId, house.id);
    await manualAssets.remove(userId, loan.id);
    const nwFinal = await aggSvc.netWorth(userId, false);
    assert(
      new Prisma.Decimal(nwFinal.assets).equals(plaidOnlyAssets._sum.currentBalance ?? new Prisma.Decimal(0)),
      "assets should revert to Plaid-only after delete",
    );
    const list2 = await manualAssets.list(userId);
    assert(list2.assets.length === 0 && list2.liabilities.length === 0, "list should be empty after delete");

    console.log("9) purge…");
    await items.removeItem(userId, itemId);
    await prisma.profile.delete({ where: { id: userId } }).catch(() => undefined);

    console.log("\n✅ Phase 9 live manual assets/liabilities E2E passed");
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error("\n❌ MANUAL ASSETS E2E FAILED:", err);
  process.exit(1);
});
