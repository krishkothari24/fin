/**
 * Live end-to-end check for Phase 6 Row-Level Security.
 *
 * Seeds two users (A, B) directly, then proves:
 *   - the OWNER connection (what the API uses) still sees everything — RLS does
 *     not break the app (no FORCE),
 *   - a direct `authenticated` session for user B sees ONLY user B's rows across
 *     accounts / transactions / items (cross-tenant reads are blocked at the DB),
 *   - the encrypted access-token column is not selectable via that path,
 *   - the webhook_events system table is invisible to `authenticated`.
 *
 * Run: pnpm --filter @fin/api e2e:rls   (dev-shell sandbox must be disabled)
 */
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

/** Run a block as the Supabase `authenticated` role, impersonating `userId`. */
async function asAuthenticated<T>(
  direct: PrismaClient,
  userId: string,
  fn: (tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">) => Promise<T>,
): Promise<T> {
  return direct.$transaction(async (tx) => {
    // auth.uid() reads the JWT `sub` from this GUC; set it before switching role.
    await tx.$executeRawUnsafe(
      `SELECT set_config('request.jwt.claims', '{"sub":"${userId}","role":"authenticated"}', true)`,
    );
    await tx.$executeRawUnsafe(`SET LOCAL ROLE authenticated`);
    return fn(tx);
  });
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  const prisma = app.get(PrismaService); // OWNER role, via the pooled app connection
  // A session connection for role-switching (SET ROLE needs a real session).
  const direct = new PrismaClient({
    datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
  });

  const userA = randomUUID();
  const userB = randomUUID();
  const tag = randomUUID().slice(0, 8);

  try {
    console.log("1) seed two users, each with item -> account -> txn -> snapshot -> config…");
    for (const uid of [userA, userB]) {
      await prisma.profile.create({ data: { id: uid, email: `${uid}@rls.test` } });
      const item = await prisma.plaidItem.create({
        data: {
          userId: uid,
          plaidItemId: `it_${tag}_${uid}`,
          accessTokenCiphertext: "ciphertext",
          institutionName: "Test Bank",
        },
      });
      const acct = await prisma.account.create({
        data: {
          itemId: item.id,
          plaidAccountId: `ac_${tag}_${uid}`,
          name: "Checking",
          type: "depository",
          currentBalance: "100.00",
        },
      });
      await prisma.transaction.create({
        data: {
          accountId: acct.id,
          plaidTransactionId: `tx_${tag}_${uid}`,
          amount: "12.34",
          date: new Date("2026-07-01T00:00:00.000Z"),
          name: "Coffee",
        },
      });
      await prisma.balanceSnapshot.create({
        data: { accountId: acct.id, date: new Date("2026-07-01T00:00:00.000Z"), current: "100.00" },
      });
      await prisma.dashboardConfig.create({ data: { userId: uid, config: {} } });
    }

    console.log("2) OWNER (API role) sees both users -> app unaffected by RLS…");
    const ownerCount = await prisma.account.count({
      where: { plaidAccountId: { in: [`ac_${tag}_${userA}`, `ac_${tag}_${userB}`] } },
    });
    assert(ownerCount === 2, `owner should see both accounts, saw ${ownerCount}`);

    console.log("3) AUTHENTICATED user B sees ONLY its own rows…");
    const seen = await asAuthenticated(direct, userB, async (tx) => {
      const accounts = await tx.$queryRawUnsafe<{ plaid_account_id: string }[]>(
        `SELECT plaid_account_id FROM accounts WHERE plaid_account_id LIKE 'ac_${tag}_%'`,
      );
      const items = await tx.$queryRawUnsafe<{ user_id: string }[]>(
        `SELECT user_id FROM plaid_items WHERE plaid_item_id LIKE 'it_${tag}_%'`,
      );
      const txns = await tx.$queryRawUnsafe<{ plaid_transaction_id: string }[]>(
        `SELECT plaid_transaction_id FROM transactions WHERE plaid_transaction_id LIKE 'tx_${tag}_%'`,
      );
      return {
        accounts: accounts.map((r) => r.plaid_account_id),
        items: items.map((r) => r.user_id),
        txns: txns.map((r) => r.plaid_transaction_id),
      };
    });
    assert(
      seen.accounts.length === 1 && seen.accounts[0] === `ac_${tag}_${userB}`,
      `user B must see only its own account, saw ${JSON.stringify(seen.accounts)}`,
    );
    assert(
      seen.items.length === 1 && seen.items[0] === userB,
      `user B must see only its own item, saw ${JSON.stringify(seen.items)}`,
    );
    assert(
      seen.txns.length === 1 && seen.txns[0] === `tx_${tag}_${userB}`,
      `user B must see only its own transaction, saw ${JSON.stringify(seen.txns)}`,
    );
    console.log(`   B saw exactly its own 1 account / 1 item / 1 txn ✓`);

    console.log("4) encrypted access token is NOT selectable via the authenticated path…");
    let tokenBlocked = false;
    try {
      await asAuthenticated(direct, userB, (tx) =>
        tx.$queryRawUnsafe(`SELECT access_token_ciphertext FROM plaid_items LIMIT 1`),
      );
    } catch {
      tokenBlocked = true;
    }
    assert(tokenBlocked, "access_token_ciphertext must NOT be selectable by authenticated");

    console.log("5) webhook_events system table is invisible to authenticated…");
    let webhookBlocked = false;
    try {
      await asAuthenticated(direct, userB, (tx) =>
        tx.$queryRawUnsafe(`SELECT id FROM webhook_events LIMIT 1`),
      );
    } catch {
      webhookBlocked = true;
    }
    assert(webhookBlocked, "webhook_events must NOT be selectable by authenticated");

    console.log("\n✅ Phase 6 RLS isolation E2E passed");
  } finally {
    await prisma.profile
      .deleteMany({ where: { id: { in: [userA, userB] } } })
      .catch(() => undefined); // cascades to items/accounts/txns/snapshots/config
    await direct.$disconnect().catch(() => undefined);
    await app.close();
  }
}

main().catch((err) => {
  console.error("\n❌ RLS E2E FAILED:", err);
  process.exit(1);
});
