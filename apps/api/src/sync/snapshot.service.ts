import { Injectable, Logger } from "@nestjs/common";
import { PrismaOwnerService } from "../prisma/prisma-owner.service";

/** UTC date at midnight (matches Prisma @db.Date storage). */
function utcDateOnly(d: Date): Date {
  return new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

/**
 * Writes a daily balance snapshot for every account, across every user, in one
 * pass. Runs on a schedule (see QueueService). Idempotent per (account, day)
 * via the unique constraint, so running twice in a day just updates today's
 * row. These rows power the net-worth-over-time series in AggregationsService.
 *
 * Deliberately uses PrismaOwnerService (bypasses RLS) rather than a per-user
 * PrismaService.withUserContext — this is a genuinely cross-user system job by
 * design, not a per-request or per-item operation with a single owner to scope to.
 */
@Injectable()
export class SnapshotService {
  private readonly logger = new Logger(SnapshotService.name);

  constructor(private readonly prisma: PrismaOwnerService) {}

  async snapshotAllBalances(): Promise<{ accounts: number }> {
    const today = utcDateOnly(new Date());
    const accounts = await this.prisma.account.findMany({
      select: { id: true, currentBalance: true, availableBalance: true },
    });

    for (const a of accounts) {
      await this.prisma.balanceSnapshot.upsert({
        where: { accountId_date: { accountId: a.id, date: today } },
        create: {
          accountId: a.id,
          date: today,
          current: a.currentBalance,
          available: a.availableBalance,
        },
        update: { current: a.currentBalance, available: a.availableBalance },
      });
    }

    this.logger.log(`snapshotted balances for ${accounts.length} account(s)`);
    return { accounts: accounts.length };
  }
}
