import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job, PgBoss } from "pg-boss";
import { SnapshotService } from "./snapshot.service";
import { SyncService } from "./sync.service";

export const SYNC_QUEUE = "sync-item";
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

      // Daily balance snapshots (cron -> net-worth-over-time).
      await this.boss.createQueue(SNAPSHOT_QUEUE);
      await this.boss.work(SNAPSHOT_QUEUE, async () => {
        await this.snapshot.snapshotAllBalances();
      });
      await this.boss.schedule(SNAPSHOT_QUEUE, SNAPSHOT_CRON);

      this.ready = true;
      this.logger.log(
        `pg-boss started; workers on '${SYNC_QUEUE}' + '${SNAPSHOT_QUEUE}' (daily ${SNAPSHOT_CRON})`,
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

  async onModuleDestroy(): Promise<void> {
    await this.boss?.stop().catch(() => undefined);
  }
}
