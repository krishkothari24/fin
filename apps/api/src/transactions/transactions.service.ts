import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { TransactionDto, TransactionsPage } from "@fin/shared";
import { PrismaService } from "../prisma/prisma.service";
import { toTransactionDto } from "./transaction.dto";
import { ListTransactionsQuery } from "./dto/list-transactions.query";
import { UpdateTransactionDetailDto } from "./dto/update-transaction-detail.dto";
import { SetTransactionSplitsDto } from "./dto/set-transaction-splits.dto";

const INCLUDE = { detail: true, splits: true } as const;

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Filtered, paginated transactions for the user, newest first. */
  async list(userId: string, q: ListTransactionsQuery): Promise<TransactionsPage> {
    const where = this.buildWhere(userId, q);

    const total = await this.prisma.transaction.count({ where });
    const rows = await this.prisma.transaction.findMany({
      where,
      include: INCLUDE,
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

  /** Set note / category override / tags. Upserts the 1:1 detail row (created lazily). */
  async updateDetail(userId: string, id: string, dto: UpdateTransactionDetailDto): Promise<TransactionDto> {
    await this.findOwned(userId, id);

    const data: Prisma.TransactionDetailUncheckedUpdateInput = {};
    if (dto.note !== undefined) data.note = dto.note;
    if (dto.categoryOverride !== undefined) data.categoryOverride = dto.categoryOverride;
    if (dto.tags !== undefined) data.tags = dto.tags;

    await this.prisma.transactionDetail.upsert({
      where: { transactionId: id },
      create: {
        transactionId: id,
        note: dto.note ?? null,
        categoryOverride: dto.categoryOverride ?? null,
        tags: dto.tags ?? [],
      },
      update: data,
    });

    return this.getOne(id);
  }

  /** Replace the full set of splits. Amounts must sum exactly to the transaction's amount. */
  async setSplits(userId: string, id: string, dto: SetTransactionSplitsDto): Promise<TransactionDto> {
    const txn = await this.findOwned(userId, id);

    const sum = dto.splits.reduce((s, line) => s.plus(line.amount), new Prisma.Decimal(0));
    if (!sum.equals(txn.amount)) {
      throw new BadRequestException(
        `Split amounts (${sum.toString()}) must sum to the transaction amount (${txn.amount.toString()})`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.transactionSplit.deleteMany({ where: { transactionId: id } }),
      this.prisma.transactionSplit.createMany({
        data: dto.splits.map((line) => ({
          transactionId: id,
          amount: new Prisma.Decimal(line.amount),
          categoryOverride: line.category ?? null,
          note: line.note ?? null,
        })),
      }),
    ]);

    return this.getOne(id);
  }

  /** Clear all splits — back to unsplit. */
  async clearSplits(userId: string, id: string): Promise<TransactionDto> {
    await this.findOwned(userId, id);
    await this.prisma.transactionSplit.deleteMany({ where: { transactionId: id } });
    return this.getOne(id);
  }

  private async getOne(id: string): Promise<TransactionDto> {
    const row = await this.prisma.transaction.findUniqueOrThrow({ where: { id }, include: INCLUDE });
    return toTransactionDto(row);
  }

  /** Ownership check via the account -> item -> user chain (same as buildWhere). */
  private async findOwned(userId: string, id: string) {
    const txn = await this.prisma.transaction.findFirst({ where: { id, account: { item: { userId } } } });
    if (!txn) throw new NotFoundException("Transaction not found");
    return txn;
  }

  private buildWhere(userId: string, q: ListTransactionsQuery): Prisma.TransactionWhereInput {
    const date: Prisma.DateTimeFilter = {};
    if (q.startDate) date.gte = new Date(`${q.startDate}T00:00:00.000Z`);
    if (q.endDate) date.lte = new Date(`${q.endDate}T00:00:00.000Z`);

    const and: Prisma.TransactionWhereInput[] = [
      { account: { item: { userId }, ...(q.accountId ? { id: q.accountId } : {}) } },
    ];
    if (q.startDate || q.endDate) and.push({ date });
    if (q.category) {
      // Match either Plaid's own category or a user override — a category filter
      // should still find a transaction the user has recategorized.
      and.push({ OR: [{ pfcPrimary: q.category }, { detail: { categoryOverride: q.category } }] });
    }
    if (q.pending !== undefined) and.push({ pending: q.pending });
    if (q.search) {
      and.push({
        OR: [
          { name: { contains: q.search, mode: "insensitive" } },
          { merchantName: { contains: q.search, mode: "insensitive" } },
        ],
      });
    }
    if (q.tags?.length) and.push({ detail: { tags: { hasSome: q.tags } } });

    return { AND: and };
  }
}
