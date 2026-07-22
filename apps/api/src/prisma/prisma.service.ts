import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { prismaTxContext } from "./prisma-context";

/**
 * Model-delegate property names on the generated client (`Object.keys(new
 * PrismaClient())`). Redefined below so each one transparently follows the
 * active per-request/per-job transaction when one is open.
 */
const MODEL_KEYS = [
  "profile",
  "plaidItem",
  "account",
  "transaction",
  "transactionDetail",
  "transactionSplit",
  "balanceSnapshot",
  "dashboardConfig",
  "webhookEvent",
  "security",
  "holding",
  "investmentTransaction",
  "liability",
  "recurringStream",
  "manualAsset",
  "budget",
  "goal",
] as const;

/**
 * Prisma client as a Nest provider. Connects lazily on first query, so the app
 * boots even without a reachable database (queries fail only when actually run).
 *
 * Phase 13: once `DATABASE_URL` points at the non-owner `app_runtime` role
 * (see migration `20260722000000_phase13_force_rls_app_runtime`), every table
 * has `FORCE ROW LEVEL SECURITY` — so a query only sees/affects rows belonging
 * to whichever `app.user_id` is set on the current Postgres session. That GUC
 * only lives inside a transaction (`SET LOCAL`), so `withUserContext()` below
 * is how `UserContextInterceptor` establishes it around every HTTP request.
 * Every model-delegate property and the raw/batch query methods are overridden
 * to redirect to that transaction whenever one is open — meaning every
 * existing `this.prisma.x.y(...)` call site across every service works
 * completely unchanged, whether or not a user-scoped transaction happens to be
 * open around it.
 *
 * Deliberately NOT used by the pg-boss background jobs (sync engines,
 * snapshot cron) — those run on PrismaOwnerService instead. They interleave
 * external Plaid API calls with DB writes, and holding one open Postgres
 * transaction for that whole span caused real transaction-timeout and
 * deadlock errors under concurrent syncs; they also aren't driven by
 * arbitrary user-supplied query input the way HTTP controllers are, so
 * forcing RLS onto them buys much less defense-in-depth. See QueueService.
 *
 * With the owner role still configured (local dev, before the deploy cutover),
 * all of this is inert: the owner bypasses RLS regardless, so `withUserContext`
 * just adds a harmless `set_config` call around otherwise-identical queries.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super();
    const self = this as unknown as Record<string, unknown>;

    for (const key of MODEL_KEYS) {
      const base = self[key];
      Object.defineProperty(this, key, {
        configurable: true,
        enumerable: true,
        get: () => {
          const tx = prismaTxContext.getStore();
          return tx ? (tx as unknown as Record<string, unknown>)[key] : base;
        },
      });
    }

    // $transaction / $queryRaw / $executeRaw are overloaded/generic in Prisma's
    // own types in ways a `class ... extends PrismaClient` override can't match
    // exactly, so these are monkey-patched as instance properties (still typed
    // loosely) rather than declared class methods.
    const baseTransaction = this.$transaction.bind(this);
    self.$transaction = (arg: unknown, options?: unknown) => {
      const activeTx = prismaTxContext.getStore();
      if (activeTx) {
        // Postgres has no true nested transactions, and the whole point is to
        // keep every statement on the one connection that has `app.user_id`
        // set. The batch-array queries were already built from the proxied
        // model delegates above, so they're already bound to the active
        // transaction; running them sequentially here keeps the same
        // atomicity (all on one open transaction) with no protocol mismatch
        // from mixing a transaction client's queries into the base client's
        // `$transaction`.
        if (Array.isArray(arg)) {
          return (async () => {
            const results: unknown[] = [];
            for (const p of arg) results.push(await p);
            return results;
          })();
        }
        if (typeof arg === "function") {
          return Promise.resolve((arg as (tx: Prisma.TransactionClient) => unknown)(activeTx));
        }
      }
      return baseTransaction(arg as never, options as never);
    };

    const baseQueryRaw = this.$queryRaw.bind(this);
    self.$queryRaw = (query: unknown, ...values: unknown[]) => {
      const activeTx = prismaTxContext.getStore();
      return activeTx
        ? (activeTx.$queryRaw as (...a: unknown[]) => unknown)(query, ...values)
        : baseQueryRaw(query as never, ...(values as never[]));
    };

    const baseExecuteRaw = this.$executeRaw.bind(this);
    self.$executeRaw = (query: unknown, ...values: unknown[]) => {
      const activeTx = prismaTxContext.getStore();
      return activeTx
        ? (activeTx.$executeRaw as (...a: unknown[]) => unknown)(query, ...values)
        : baseExecuteRaw(query as never, ...(values as never[]));
    };
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Every model-delegate call this app makes goes through `this.prisma.<model>`
   * (the getters above), so wrapping `fn` here is sufficient to scope the
   * *entire* call tree beneath it — nested service calls, nested `$transaction`
   * batches, raw queries — without touching any of that code.
   *
   * `timeout` is bumped from Prisma's 5s default: the Plaid-exchange endpoint
   * makes a few sequential Plaid API calls inside this scope, and a request
   * this app makes only once per bank connection (not raced against itself the
   * way background syncs are) is worth a generous margin over a hard 5s cap.
   */
  async withUserContext<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    return this.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
        return prismaTxContext.run(tx, fn);
      },
      { timeout: 20_000, maxWait: 10_000 },
    ) as Promise<T>;
  }
}
