import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { LiabilitiesResponse } from "@fin/shared";
import { PrismaService } from "../prisma/prisma.service";
import { toLiabilityDto } from "./liability.dto";

@Injectable()
export class LiabilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  /** All liabilities for the user (hidden accounts excluded), plus debt totals. */
  async listLiabilities(userId: string): Promise<LiabilitiesResponse> {
    const rows = await this.prisma.liability.findMany({
      where: { account: { isHidden: false, item: { userId } } },
      include: { account: true },
      orderBy: { account: { currentBalance: { sort: "desc", nulls: "last" } } },
    });

    let totalDebt = new Prisma.Decimal(0);
    let minimumPaymentDue = new Prisma.Decimal(0);
    let currency = "USD";
    for (const l of rows) {
      if (l.account.currentBalance != null) totalDebt = totalDebt.plus(l.account.currentBalance);
      if (l.minimumPaymentAmount != null) {
        minimumPaymentDue = minimumPaymentDue.plus(l.minimumPaymentAmount);
      }
      if (l.account.currency) currency = l.account.currency;
    }

    return {
      liabilities: rows.map(toLiabilityDto),
      totals: {
        totalDebt: totalDebt.toString(),
        minimumPaymentDue: minimumPaymentDue.toString(),
        currency,
      },
    };
  }
}
