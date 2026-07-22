import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * A second, deliberately-separate Prisma client connected via `DIRECT_URL`
 * (the owner role — same connection migrations use), for the handful of
 * genuinely cross-user / not-yet-user-scoped operations that cannot go through
 * the RLS-scoped `PrismaService`:
 *
 *   - the Plaid webhook handler resolving *which user* an incoming `item_id`
 *     belongs to (there's no user context until this lookup resolves one),
 *   - the daily balance-snapshot cron, which by design touches every user's
 *     accounts in one pass.
 *
 * Every other call site should use `PrismaService`, scoped via
 * `withUserContext()`. Keeping this as a distinctly-named, separately-injected
 * class (rather than a flag/mode on `PrismaService`) makes every owner-bypass
 * call site grep-able and hard to reach for by accident.
 */
@Injectable()
export class PrismaOwnerService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ datasources: { db: { url: process.env.DIRECT_URL } } });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
