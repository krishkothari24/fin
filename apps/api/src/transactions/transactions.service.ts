import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { TransactionsPage } from "@fin/shared";
import { PrismaService } from "../prisma/prisma.service";
import { toTransactionDto } from "./transaction.dto";
import { ListTransactionsQuery } from "./dto/list-transactions.query";

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Filtered, paginated transactions for the user, newest first. */
  async list(userId: string, q: ListTransactionsQuery): Promise<TransactionsPage> {
    const where = this.buildWhere(userId, q);

    const total = await this.prisma.transaction.count({ where });
    const rows = await this.prisma.transaction.findMany({
      where,
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: q.limit,
      skip: q.offset,
    });

    return {
      transactions: rows.map(toTransactionDto),
      total,
      limit: q.limit,
      offset: q.offset,
    };
  }

  private buildWhere(userId: string, q: ListTransactionsQuery): Prisma.TransactionWhereInput {
    const date: Prisma.DateTimeFilter = {};
    if (q.startDate) date.gte = new Date(`${q.startDate}T00:00:00.000Z`);
    if (q.endDate) date.lte = new Date(`${q.endDate}T00:00:00.000Z`);

    return {
      account: {
        item: { userId },
        ...(q.accountId ? { id: q.accountId } : {}),
      },
      ...(q.startDate || q.endDate ? { date } : {}),
      ...(q.category ? { pfcPrimary: q.category } : {}),
      ...(q.pending !== undefined ? { pending: q.pending } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: "insensitive" } },
              { merchantName: { contains: q.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
  }
}
