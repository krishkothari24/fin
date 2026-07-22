import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job, PgBoss } from "pg-boss";
import { InvestmentsSyncService } from "../investments/investments-sync.service";
import { LiabilitiesSyncService } from "../liabilities/liabilities-sync.service";
import { RecurringSyncService } from "../recurring/recurring-sync.service";
import { SnapshotService } from "./snapshot.service";
import { SyncService } from "./sync.service";

export const SYNC_QUEUE = "sync-item";
export const INVESTMENTS_QUEUE = "sync-investments";
export const LIABILITIES_QUEUE = "sync-liabilities";
export const RECURRING_QUEUE = "sync-recurring";
export const SNAPSHOT_QUEUE = "snapshot-balances";
/** Daily at 06:00 UTC — cheap and off-peak. */
const SNAPSHOT_CRON = "0 6 * * *";

interface SyncJob {
  itemId: string;
}

/**
 * Postgres-backed background job queue (pg-boss). We use it so a bank connection
 * or an incoming webhook can enqueue a sync and return immediately, while a
 * worker in this process drains the queue.
 *
 * The sync engines (SyncService, InvestmentsSyncService, LiabilitiesSyncService,
 * RecurringSyncService, SnapshotService) all run on PrismaOwnerService, not the
 * request-scoped PrismaService: each interleaves external Plaid API calls with
 * DB writes, and Phase 13's per-request `withUserContext` holds a single open
 * Postgres transaction for its whole scope — fine for a fast, DB-only HTTP
 * request, but wrapping a multi-second (or overlapping, retried) Plaid sync in
 * one long-lived transaction caused real transaction-timeout and deadlock
 * errors under this app's own concurrent-sync idempotency test. Background
 * jobs also aren't driven by arbitrary user-supplied query parameters the way
 * HTTP controllers are (they process one server-resolved itemId at a time), so
 * the IDOR-defense-in-depth value of forcing RLS onto them is much lower than
 * on the HTTP path — not worth the reliability cost. See docs/SECURITY.md.
 *
 * The queue is best-effort at boot: if it can't start (no DB, DB down), the API
 * still serves HTTP; enqueue calls just log and no-op until it's healthy.
 */
@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private boss?: PgBoss;
  private ready = false;

  constructor(
    private readonly config: ConfigService,
    private readonly sync: SyncService,
    private readonly snapshot: SnapshotService,
    private readonly investments: InvestmentsSyncService,
    private readonly liabilities: LiabilitiesSyncService,
    private readonly recurring: RecurringSyncService,
  ) {}

  async onModuleInit(): Promise<void> {
    // pg-boss needs a *session-mode* connection (advisory locks + LISTEN/NOTIFY).
    // On Supabase that is DIRECT_URL (session pooler, :5432) — NOT the transaction
    // pooler (:6543, DATABASE_URL) the app uses for normal queries.
    const connectionString =
      this.config.get<string>("DIRECT_URL") || this.config.get<string>("DATABASE_URL");
    if (!connectionString) {
      this.logger.warn("No DIRECT_URL/DATABASE_URL set — job queue disabled.");
      return;
    }

    try {
      this.boss = new PgBoss({ connectionString, schema: "pgboss", max: 4 });
      this.boss.on("error", (e) => this.logger.error(`pg-boss error: ${String(e)}`));
      await this.boss.start();

      // Transaction syncs (enqueued on connect + webhook).
      await this.boss.createQueue(SYNC_QUEUE);
      await this.boss.work<SyncJob>(SYNC_QUEUE, async (jobs: Job<SyncJob>[]) => {
        for (const job of jobs) {
          this.logger.log(`sync job ${job.id} -> item ${job.data.itemId}`);
          await this.sync.syncItem(job.data.itemId);
        }
      });

      // Investments sync (holdings + investment transactions), enqueued on
      // connect + on HOLDINGS / INVESTMENTS_TRANSACTIONS webhooks.
      await this.boss.createQueue(INVESTMENTS_QUEUE);
      await this.boss.work<SyncJob>(INVESTMENTS_QUEUE, async (jobs: Job<SyncJob>[]) => {
        for (const job of jobs) {
          this.logger.log(`investments job ${job.id} -> item ${job.data.itemId}`);
          await this.investments.syncItem(job.data.itemId);
        }
      });

      // Liabilities sync (card / loan detail), enqueued on connect + on the
      // LIABILITIES / DEFAULT_UPDATE webhook.
      await this.boss.createQueue(LIABILITIES_QUEUE);
      await this.boss.work<SyncJob>(LIABILITIES_QUEUE, async (jobs: Job<SyncJob>[]) => {
        for (const job of jobs) {
          this.logger.log(`liabilities job ${job.id} -> item ${job.data.itemId}`);
          await this.liabilities.syncItem(job.data.itemId);
        }
      });

      // Recurring transactions sync (subscriptions / bills), enqueued on connect +
      // on the TRANSACTIONS / RECURRING_TRANSACTIONS_UPDATE webhook.
      await this.boss.createQueue(RECURRING_QUEUE);
      await this.boss.work<SyncJob>(RECURRING_QUEUE, async (jobs: Job<SyncJob>[]) => {
        for (const job of jobs) {
          this.logger.log(`recurring job ${job.id} -> item ${job.data.itemId}`);
          await this.recurring.syncItem(job.data.itemId);
        }
      });

      // Daily balance snapshots (cron -> net-worth-over-time).
      await this.boss.createQueue(SNAPSHOT_QUEUE);
      await this.boss.work(SNAPSHOT_QUEUE, async () => {
        await this.snapshot.snapshotAllBalances();
      });
      await this.boss.schedule(SNAPSHOT_QUEUE, SNAPSHOT_CRON);

      this.ready = true;
      this.logger.log(
        `pg-boss started; workers on '${SYNC_QUEUE}', '${INVESTMENTS_QUEUE}', ` +
          `'${LIABILITIES_QUEUE}', '${RECURRING_QUEUE}', '${SNAPSHOT_QUEUE}' (daily ${SNAPSHOT_CRON})`,
      );
    } catch (err) {
      this.logger.warn(`pg-boss failed to start; job queue disabled: ${String(err)}`);
    }
  }

  /** True once pg-boss has started and the worker is listening. */
  get started(): boolean {
    return this.ready;
  }

  /** Enqueue an incremental/initial sync for an Item. Safe no-op if queue is down. */
  async enqueueSync(itemId: string): Promise<void> {
    if (!this.ready || !this.boss) {
      this.logger.warn(`queue not ready — skipping sync enqueue for item ${itemId}`);
      return;
    }
    await this.boss.send(SYNC_QUEUE, { itemId });
  }

  /** Enqueue an investments sync (holdings + investment transactions). Safe no-op if queue is down. */
  async enqueueInvestmentsSync(itemId: string): Promise<void> {
    if (!this.ready || !this.boss) {
      this.logger.warn(`queue not ready — skipping investments enqueue for item ${itemId}`);
      return;
    }
    await this.boss.send(INVESTMENTS_QUEUE, { itemId });
  }

  /** Enqueue a liabilities sync (card / loan detail). Safe no-op if queue is down. */
  async enqueueLiabilitiesSync(itemId: string): Promise<void> {
    if (!this.ready || !this.boss) {
      this.logger.warn(`queue not ready — skipping liabilities enqueue for item ${itemId}`);
      return;
    }
    await this.boss.send(LIABILITIES_QUEUE, { itemId });
  }

  /** Enqueue a recurring-transactions sync (subscriptions / bills). Safe no-op if queue is down. */
  async enqueueRecurringSync(itemId: string): Promise<void> {
    if (!this.ready || !this.boss) {
      this.logger.warn(`queue not ready — skipping recurring enqueue for item ${itemId}`);
      return;
    }
    await this.boss.send(RECURRING_QUEUE, { itemId });
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss?.stop().catch(() => undefined);
  }
}
