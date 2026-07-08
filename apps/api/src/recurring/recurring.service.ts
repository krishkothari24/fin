import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { RecurringResponse, RecurringStreamDto } from "@fin/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ListRecurringQuery } from "./dto/list-recurring.query";
import { toRecurringStreamDto } from "./recurring.dto";

@Injectable()
export class RecurringService {
  constructor(private readonly prisma: PrismaService) {}

  /** Recurring streams for the user (hidden accounts excluded), split by direction. */
  async listRecurring(userId: string, q: ListRecurringQuery): Promise<RecurringResponse> {
    const where: Prisma.RecurringStreamWhereInput = {
      account: {
        isHidden: false,
        item: { userId },
        ...(q.accountId ? { id: q.accountId } : {}),
      },
      ...(q.activeOnly ? { isActive: true } : {}),
    };

    const rows = await this.prisma.recurringStream.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { averageAmount: { sort: "desc", nulls: "last" } }],
    });

    const inflows: RecurringStreamDto[] = [];
    const outflows: RecurringStreamDto[] = [];
    let monthlyInflow = new Prisma.Decimal(0);
    let monthlyOutflow = new Prisma.Decimal(0);
    let currency = "USD";

    for (const row of rows) {
      const dto = toRecurringStreamDto(row);
      if (row.currency) currency = row.currency;
      // Only active streams contribute to the monthly run-rate totals.
      const monthly = row.isActive && dto.monthlyEstimate ? new Prisma.Decimal(dto.monthlyEstimate) : null;
      if (dto.direction === "inflow") {
        inflows.push(dto);
        if (monthly) monthlyInflow = monthlyInflow.plus(monthly);
      } else {
        outflows.push(dto);
        if (monthly) monthlyOutflow = monthlyOutflow.plus(monthly);
      }
    }

    return {
      inflows,
      outflows,
      totals: {
        monthlyInflow: monthlyInflow.toString(),
        monthlyOutflow: monthlyOutflow.toString(),
        currency,
      },
    };
  }
}
