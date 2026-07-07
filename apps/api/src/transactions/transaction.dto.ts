import { Transaction } from "@prisma/client";
import { TransactionDto } from "@fin/shared";

/** Map a persisted Transaction to the API DTO. Pure. */
export function toTransactionDto(t: Transaction): TransactionDto {
  return {
    id: t.id,
    accountId: t.accountId,
    amount: t.amount.toString(), // Plaid sign: positive = money out
    currency: t.currency,
    date: t.date.toISOString().slice(0, 10), // @db.Date -> YYYY-MM-DD
    name: t.name,
    merchantName: t.merchantName,
    pending: t.pending,
    category: { primary: t.pfcPrimary, detailed: t.pfcDetailed },
  };
}
