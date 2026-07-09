import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PLAID_PRIMARY_CATEGORIES, BudgetDto, BudgetsResponse } from "@fin/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AggregationsService } from "../aggregations/aggregations.service";

const ZERO = new Prisma.Decimal(0);

/** First and last calendar day (inclusive) of a YYYY-MM month, as YYYY-MM-DD strings. */
function monthRange(month: string): { start: string; end: string } {
  const [year, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const end = `${month}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aggregations: AggregationsService,
  ) {}

  /** Every budgeted category merged with that month's actual spend. */
  async list(userId: string, month?: string): Promise<BudgetsResponse> {
    const targetMonth = month ?? currentMonth();
    const { start, end } = monthRange(targetMonth);

    const [rows, spend] = await Promise.all([
      this.prisma.budget.findMany({ where: { userId }, orderBy: { category: "asc" } }),
      this.aggregations.spendingByCategory(userId, start, end),
    ]);
    const spendByCategory = new Map(spend.map((s) => [s.category, s.amount]));

    const budgets: BudgetDto[] = rows.map((row) => {
      const spent = new Prisma.Decimal(spendByCategory.get(row.category) ?? ZERO);
      const limit = row.monthlyLimit;
      const percentUsed = limit.isZero() ? 0 : spent.dividedBy(limit).times(100).toNumber();
      return {
        category: row.category,
        monthlyLimit: limit.toString(),
        spent: spent.toString(),
        remaining: limit.minus(spent).toString(),
        percentUsed,
        currency: row.currency ?? "USD",
      };
    });

    return { month: targetMonth, budgets };
  }

  async upsert(userId: string, category: string, monthlyLimit: string): Promise<BudgetDto> {
    if (!(PLAID_PRIMARY_CATEGORIES as readonly string[]).includes(category)) {
      throw new NotFoundException(`Unknown category: ${category}`);
    }
    await this.ensureProfile(userId);
    const row = await this.prisma.budget.upsert({
      where: { userId_category: { userId, category } },
      create: { userId, category, monthlyLimit: new Prisma.Decimal(monthlyLimit) },
      update: { monthlyLimit: new Prisma.Decimal(monthlyLimit) },
    });

    const { start, end } = monthRange(currentMonth());
    const spend = await this.aggregations.spendingByCategory(userId, start, end);
    const spent = new Prisma.Decimal(spend.find((s) => s.category === category)?.amount ?? ZERO);
    const percentUsed = row.monthlyLimit.isZero() ? 0 : spent.dividedBy(row.monthlyLimit).times(100).toNumber();

    return {
      category: row.category,
      monthlyLimit: row.monthlyLimit.toString(),
      spent: spent.toString(),
      remaining: row.monthlyLimit.minus(spent).toString(),
      percentUsed,
      currency: row.currency ?? "USD",
    };
  }

  async remove(userId: string, category: string): Promise<void> {
    const existing = await this.prisma.budget.findFirst({ where: { userId, category } });
    if (!existing) throw new NotFoundException("Budget not found");
    await this.prisma.budget.delete({ where: { id: existing.id } });
  }

  private async ensureProfile(userId: string): Promise<void> {
    await this.prisma.profile.upsert({ where: { id: userId }, create: { id: userId }, update: {} });
  }
}
