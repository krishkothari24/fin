/**
 * Live Plaid Sandbox end-to-end check for Phase 2.
 *
 * Exercises the real DI container (same services the HTTP endpoints use):
 *   sandbox public_token -> exchange+store -> verify DB -> list -> refresh -> remove
 *
 * Requires apps/api/.env with DATABASE_URL (migrated), PLAID_CLIENT_ID,
 * PLAID_SECRET (sandbox), ENCRYPTION_KEY. Run:
 *   pnpm --filter @fin/api e2e:sandbox
 */
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { randomUUID } from "crypto";
import { AppModule } from "../src/app.module";
import { ItemsService } from "../src/items/items.service";
import { PlaidService } from "../src/plaid/plaid.service";
import { PrismaService } from "../src/prisma/prisma.service";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const plaid = app.get(PlaidService);
  const items = app.get(ItemsService);
  const prisma = app.get(PrismaService);
  const userId = randomUUID();

  try {
    console.log("1) mint sandbox public_token…");
    const publicToken = await plaid.sandboxCreatePublicToken();
    assert(publicToken.startsWith("public-sandbox"), "expected a sandbox public_token");
    console.log("   ok");

    console.log("2) exchange + store (encrypt access_token, save item + accounts)…");
    const result = await items.exchangeAndStore(userId, publicToken);
    console.log("   ->", result);
    assert(result.accountsConnected > 0, "expected at least one account");

    console.log("3) verify persisted rows…");
    const stored = await prisma.plaidItem.findMany({
      where: { userId },
      include: { accounts: true },
    });
    assert(stored.length === 1, "expected exactly one item");
    assert(stored[0].accounts.length > 0, "expected accounts persisted");
    assert(
      !stored[0].accessTokenCiphertext.includes("access-sandbox"),
      "access token must NOT be stored in cleartext",
    );
    assert(stored[0].accessTokenCiphertext.split(".").length === 3, "expected iv.tag.data ciphertext");
    console.log(
      `   item ${stored[0].id} · ${stored[0].institutionName} · ${stored[0].accounts.length} accounts · token encrypted ✓`,
    );

    console.log("4) list + refresh balances…");
    console.log("   list:", await items.listItems(userId));
    console.log("   refresh:", await items.refreshBalances(userId, stored[0].id));

    console.log("5) remove item (Plaid /item/remove + local purge)…");
    console.log("   ->", await items.removeItem(userId, stored[0].id));
    const after = await prisma.plaidItem.count({ where: { userId } });
    assert(after === 0, "item should be gone after remove");

    await prisma.profile.delete({ where: { id: userId } }).catch(() => undefined);
    console.log("\n✅ Phase 2 live Sandbox E2E passed");
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error("\n❌ E2E FAILED:", err);
  process.exit(1);
});
