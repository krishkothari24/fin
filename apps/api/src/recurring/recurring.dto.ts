import { RecurringStream } from "@prisma/client";
import { RecurringDirection, RecurringStreamDto } from "@fin/shared";
import { monthlyEstimate } from "./recurring.mappers";

export function toRecurringStreamDto(s: RecurringStream): RecurringStreamDto {
  const averageAmount = s.averageAmount?.toString() ?? null;
  return {
    id: s.id,
    accountId: s.accountId,
    direction: s.direction as RecurringDirection,
    description: s.description,
    merchantName: s.merchantName,
    category: s.category,
    frequency: s.frequency,
    status: s.status,
    isActive: s.isActive,
    firstDate: s.firstDate.toISOString().slice(0, 10),
    lastDate: s.lastDate.toISOString().slice(0, 10),
    predictedNextDate: s.predictedNextDate?.toISOString().slice(0, 10) ?? null,
    averageAmount,
    lastAmount: s.lastAmount?.toString() ?? null,
    monthlyEstimate: monthlyEstimate(s.frequency, averageAmount),
    currency: s.currency,
  };
}
