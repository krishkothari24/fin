import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CashFlowPointDto, CategorySpendDto, NetWorthDto } from "@fin/shared";
import { PrismaService } from "../prisma/prisma.service";

const ASSET_TYPES = ["depository", "investment"];
const LIABILITY_TYPES = ["credit", "loan"];
const ZERO = new Prisma.Decimal(0);

interface SeriesRow {
  date: string;
  net_worth: string;
}
interface CashFlowRow {
  month: string;
  income: string;
  outflow: string;
}

/**
 * Deterministic financial aggregations (no AI). All queries exclude hidden
 * accounts and follow Plaid's sign convention: transaction amount > 0 is money
 * OUT (spending), amount < 0 is money IN (income).
 */
@Injectable()
export class AggregationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Current net worth = assets − liabilities (optionally with a daily series).
   * Includes manual (off-platform) assets/liabilities in the current point. The
   * historical `series` stays Plaid-accounts-only — manual entries have no daily
   * snapshot history, so a change to one only shifts today's point, not the past.
   */
  async netWorth(userId: string, includeSeries: boolean): Promise<NetWorthDto> {
    const [assetsAgg, liabAgg, manualAgg] = await Promise.all([
      this.prisma.account.aggregate({
        where: { item: { userId }, isHidden: false, type: { in: ASSET_TYPES } },
        _sum: { currentBalance: true },
      }),
      this.prisma.account.aggregate({
        where: { item: { userId }, isHidden: false, type: { in: LIABILITY_TYPES } },
        _sum: { currentBalance: true },
      }),
      this.prisma.manualAsset.groupBy({
        by: ["kind"],
        where: { userId },
        _sum: { currentValue: true },
      }),
    ]);

    const manualAssets = manualAgg.find((r) => r.kind === "asset")?._sum.currentValue ?? ZERO;
    const manualLiabilities = manualAgg.find((r) => r.kind === "liability")?._sum.currentValue ?? ZERO;
    const assets = (assetsAgg._sum.currentBalance ?? ZERO).plus(manualAssets);
    const liabilities = (liabAgg._sum.currentBalance ?? ZERO).plus(manualLiabilities);

    const dto: NetWorthDto = {
      asOf: new Date().toISOString(),
      assets: assets.toString(),
      liabilities: liabilities.toString(),
      netWorth: assets.minus(liabilities).toString(),
      currency: "USD",
    };
    if (includeSeries) dto.series = await this.netWorthSeries(userId);
    return dto;
  }

  /**
   * Spending (money out) grouped by category, largest first. Groups by Plaid's
   * `pfcPrimary` for the common case, then re-buckets the (usually small) subset
   * of transactions with a user category override — moved out of their original
   * Plaid bucket and into the override bucket. Splits do not feed this in v1;
   * a split transaction's total still counts under its own single category.
   */
  async spendingByCategory(
    userId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<CategorySpendDto[]> {
    const baseWhere: Prisma.TransactionWhereInput = {
      account: { item: { userId }, isHidden: false },
      pending: false,
      amount: { gt: 0 },
      ...this.dateWhere(startDate, endDate),
    };

    const [rows, overridden] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ["pfcPrimary"],
        where: baseWhere,
        _sum: { amount: true },
      }),
      this.prisma.transaction.findMany({
        where: { ...baseWhere, detail: { categoryOverride: { not: null } } },
        select: { amount: true, pfcPrimary: true, detail: { select: { categoryOverride: true } } },
      }),
    ]);

    const totals = new Map<string, Prisma.Decimal>();
    for (const r of rows) {
      const key = r.pfcPrimary ?? "UNCATEGORIZED";
      totals.set(key, (totals.get(key) ?? ZERO).plus(r._sum.amount ?? ZERO));
    }
    for (const t of overridden) {
      const original = t.pfcPrimary ?? "UNCATEGORIZED";
      const override = t.detail!.categoryOverride!;
      totals.set(original, (totals.get(original) ?? ZERO).minus(t.amount));
      totals.set(override, (totals.get(override) ?? ZERO).plus(t.amount));
    }

    return [...totals.entries()]
      .filter(([, amount]) => !amount.isZero())
      .map(([category, amount]) => ({ category, amount: amount.toString() }))
      .sort((a, b) => new Prisma.Decimal(b.amount).comparedTo(a.amount));
  }

  /** Income vs. outflow per calendar month. */
  async cashFlow(
    userId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<CashFlowPointDto[]> {
    const start = startDate ?? null;
    const end = endDate ?? null;

    const rows = await this.prisma.$queryRaw<CashFlowRow[]>`
      SELECT to_char(date_trunc('month', t.date), 'YYYY-MM') AS month,
             COALESCE(SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END), 0)::text AS income,
             COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END), 0)::text AS outflow
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      JOIN plaid_items i ON i.id = a.item_id
      WHERE i.user_id = ${userId}::uuid
        AND a.is_hidden = false
        AND t.pending = false
        AND (${start}::date IS NULL OR t.date >= ${start}::date)
        AND (${end}::date IS NULL OR t.date <= ${end}::date)
      GROUP BY 1
      ORDER BY 1
    `;

    return rows.map((r) => ({
      month: r.month,
      income: r.income,
      outflow: r.outflow,
      net: new Prisma.Decimal(r.income).minus(r.outflow).toString(),
    }));
  }

  // --- helpers -------------------------------------------------------------

  private dateWhere(startDate?: string, endDate?: string): Prisma.TransactionWhereInput {
    if (!startDate && !endDate) return {};
    const date: Prisma.DateTimeFilter = {};
    if (startDate) date.gte = new Date(`${startDate}T00:00:00.000Z`);
    if (endDate) date.lte = new Date(`${endDate}T00:00:00.000Z`);
    return { date };
  }

  /**
   * Net-worth-over-time from daily balance_snapshots (assets positive, liabilities
   * negative). Empty until the Phase 5 snapshot job populates that table.
   */
  private async netWorthSeries(userId: string): Promise<Array<{ date: string; netWorth: string }>> {
    const rows = await this.prisma.$queryRaw<SeriesRow[]>`
      SELECT to_char(s.date, 'YYYY-MM-DD') AS date,
             COALESCE(SUM(
               CASE WHEN a.type IN ('depository','investment') THEN s.current
                    WHEN a.type IN ('credit','loan') THEN -s.current
                    ELSE 0 END
             ), 0)::text AS net_worth
      FROM balance_snapshots s
      JOIN accounts a ON a.id = s.account_id
      JOIN plaid_items i ON i.id = a.item_id
      WHERE i.user_id = ${userId}::uuid AND a.is_hidden = false
      GROUP BY s.date
      ORDER BY s.date
    `;
    return rows.map((r) => ({ date: r.date, netWorth: r.net_worth }));
  }
}
