import { Transaction, TransactionDetail, TransactionSplit } from "@prisma/client";
import { TransactionDto } from "@fin/shared";

type TransactionWithDetail = Transaction & {
  detail?: TransactionDetail | null;
  splits?: TransactionSplit[];
};

/** Map a persisted Transaction (+ optional user edits) to the API DTO. Pure. */
export function toTransactionDto(t: TransactionWithDetail): TransactionDto {
  return {
    id: t.id,
    accountId: t.accountId,
    amount: t.amount.toString(), // Plaid sign: positive = money out
    currency: t.currency,
    date: t.date.toISOString().slice(0, 10), // @db.Date -> YYYY-MM-DD
    name: t.name,
    merchantName: t.merchantName,
    pending: t.pending,
    category: { primary: t.detail?.categoryOverride ?? t.pfcPrimary, detailed: t.pfcDetailed },
    note: t.detail?.note ?? null,
    tags: t.detail?.tags ?? [],
    splits: (t.splits ?? []).map((s) => ({
      id: s.id,
      amount: s.amount.toString(),
      category: s.categoryOverride,
      note: s.note,
    })),
  };
}
