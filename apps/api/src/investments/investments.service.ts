import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { HoldingsResponse, InvestmentTransactionsPage } from "@fin/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ListInvestmentTransactionsQuery } from "./dto/list-investment-transactions.query";
import { toHoldingDto, toInvestmentTransactionDto } from "./investment.dto";

@Injectable()
export class InvestmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Current holdings for the user (hidden accounts excluded), plus portfolio totals. */
  async listHoldings(userId: string): Promise<HoldingsResponse> {
    const rows = await this.prisma.holding.findMany({
      where: { account: { isHidden: false, item: { userId } } },
      include: { security: true },
      orderBy: { institutionValue: { sort: "desc", nulls: "last" } },
    });

    let value = new Prisma.Decimal(0);
    let costBasis = new Prisma.Decimal(0);
    let currency = "USD";
    for (const h of rows) {
      if (h.institutionValue != null) value = value.plus(h.institutionValue);
      if (h.costBasis != null) costBasis = costBasis.plus(h.costBasis);
      if (h.currency) currency = h.currency;
    }

    return {
      holdings: rows.map(toHoldingDto),
      totals: {
        value: value.toString(),
        costBasis: costBasis.toString(),
        gainLoss: value.minus(costBasis).toString(),
        currency,
      },
    };
  }

  /** Filtered, paginated investment transactions for the user, newest first. */
  async listInvestmentTransactions(
    userId: string,
    q: ListInvestmentTransactionsQuery,
  ): Promise<InvestmentTransactionsPage> {
    const where = this.buildWhere(userId, q);

    const total = await this.prisma.investmentTransaction.count({ where });
    const rows = await this.prisma.investmentTransaction.findMany({
      where,
      include: { security: true },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: q.limit,
      skip: q.offset,
    });

    return {
      transactions: rows.map(toInvestmentTransactionDto),
      total,
      limit: q.limit,
      offset: q.offset,
    };
  }

  private buildWhere(
    userId: string,
    q: ListInvestmentTransactionsQuery,
  ): Prisma.InvestmentTransactionWhereInput {
    const date: Prisma.DateTimeFilter = {};
    if (q.startDate) date.gte = new Date(`${q.startDate}T00:00:00.000Z`);
    if (q.endDate) date.lte = new Date(`${q.endDate}T00:00:00.000Z`);

    return {
      account: {
        item: { userId },
        ...(q.accountId ? { id: q.accountId } : {}),
      },
      ...(q.startDate || q.endDate ? { date } : {}),
      ...(q.type ? { type: q.type } : {}),
    };
  }
}
