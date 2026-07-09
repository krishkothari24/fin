/**
 * Live end-to-end check for Phase 12 (Goals).
 *
 *   connect a sandbox item + sync -> create a goal linked to a real account,
 *   assert currentAmount tracks its live balance -> create an unlinked goal,
 *   bump currentAmountOverride, assert progress math -> ownership check
 *   -> delete the linked account's item -> linkedAccountId goes null (SetNull),
 *   goal survives -> purge
 *
 * Run: pnpm --filter @fin/api e2e:goals   (dev-shell sandbox must be disabled)
 */
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { AppModule } from "../src/app.module";
import { GoalsService } from "../src/goals/goals.service";
import { ItemsService } from "../src/items/items.service";
import { PlaidService } from "../src/plaid/plaid.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { SyncService } from "../src/sync/sync.service";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  const plaid = app.get(PlaidService);
  const items = app.get(ItemsService);
  const sync = app.get(SyncService);
  const goals = app.get(GoalsService);
  const prisma = app.get(PrismaService);
  const userId = randomUUID();
  const otherUserId = randomUUID();

  try {
    console.log("1) connect a sandbox item + sync (need a real account to link)…");
    const publicToken = await plaid.sandboxCreatePublicToken();
    const { itemId } = await items.exchangeAndStore(userId, publicToken);
    await sync.syncItem(itemId);
    const account = await prisma.account.findFirst({
      where: { itemId, type: "depository", currentBalance: { not: null } },
    });
    assert(account, "expected a depository account with a balance");

    console.log(`2) create a savings goal linked to account ${account!.id} (balance=${account!.currentBalance})…`);
    const linked = await goals.create(userId, {
      name: "House down payment",
      kind: "savings",
      targetAmount: "50000",
      linkedAccountId: account!.id,
    });
    assert(
      new Prisma.Decimal(linked.currentAmount).equals(account!.currentBalance!),
      `currentAmount ${linked.currentAmount} != account balance ${account!.currentBalance}`,
    );
    assert(linked.linkedAccountName === account!.name, "linkedAccountName should match the account");
    console.log(`   currentAmount=${linked.currentAmount} progressPercent=${linked.progressPercent.toFixed(2)}%`);

    console.log("3) create an unlinked debt-payoff goal, bump currentAmountOverride…");
    const unlinked = await goals.create(userId, {
      name: "Payoff credit card",
      kind: "debt_payoff",
      targetAmount: "3000",
      currentAmountOverride: "500",
    });
    assert(unlinked.currentAmount === "500", `expected currentAmount 500, got ${unlinked.currentAmount}`);
    assert(Math.abs(unlinked.progressPercent - 16.6667) < 0.01, `progressPercent ${unlinked.progressPercent}`);

    const bumped = await goals.update(userId, unlinked.id, { currentAmountOverride: "1200" });
    assert(bumped.currentAmount === "1200", "override bump should update currentAmount");
    assert(Math.abs(bumped.progressPercent - 40) < 0.01, `progressPercent ${bumped.progressPercent} != ~40`);

    console.log("4) list returns both goals…");
    const list = await goals.list(userId);
    assert(list.length === 2, `expected 2 goals, got ${list.length}`);

    console.log("5) ownership check: another user cannot read/edit/delete these goals…");
    const otherList = await goals.list(otherUserId);
    assert(otherList.length === 0, "another user should see zero goals");
    let threw = false;
    try {
      await goals.update(otherUserId, linked.id, { name: "hijacked" });
    } catch {
      threw = true;
    }
    assert(threw, "updating another user's goal should throw NotFoundException");

    console.log("6) another user cannot link a goal to an account they don't own…");
    let rejectedLink = false;
    try {
      await goals.create(otherUserId, { name: "sneaky", kind: "savings", targetAmount: "1", linkedAccountId: account!.id });
    } catch {
      rejectedLink = true;
    }
    assert(rejectedLink, "linking someone else's account should be rejected");

    console.log("7) removing the item sets linkedAccountId to null (SetNull), goal survives…");
    await items.removeItem(userId, itemId);
    const afterRemove = await prisma.goal.findUnique({ where: { id: linked.id } });
    assert(afterRemove, "goal should still exist after its linked account's item is removed");
    assert(afterRemove!.linkedAccountId === null, "linkedAccountId should be null (SetNull), not the goal deleted");
    const afterRemoveDto = (await goals.list(userId)).find((g) => g.id === linked.id)!;
    assert(afterRemoveDto.currentAmount === "0", "unlinked goal with no override should read back as 0");

    console.log("8) delete both goals…");
    await goals.remove(userId, linked.id);
    await goals.remove(userId, unlinked.id);
    const finalList = await goals.list(userId);
    assert(finalList.length === 0, "expected an empty goals list after deleting both");

    console.log("9) purge…");
    await prisma.profile.delete({ where: { id: userId } }).catch(() => undefined);

    console.log("\n✅ Phase 12 live goals E2E passed");
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error("\n❌ GOALS E2E FAILED:", err);
  process.exit(1);
});
