import { TransactionStream } from "plaid";
import { RecurringDirection } from "@fin/shared";

/** Parse a Plaid `YYYY-MM-DD` date string into a UTC-midnight Date (for @db.Date). */
function plaidDate(d: string | null | undefined): Date | null {
  return d ? new Date(`${d}T00:00:00.000Z`) : null;
}

/** Approximate number of occurrences per month for each Plaid frequency. */
const PER_MONTH: Record<string, number> = {
  WEEKLY: 52 / 12,
  BIWEEKLY: 26 / 12,
  SEMI_MONTHLY: 2,
  MONTHLY: 1,
  ANNUALLY: 1 / 12,
};

/** Normalize a stream's average amount to a per-month figure, or null if unknown. */
export function monthlyEstimate(frequency: string, averageAmount: string | null): string | null {
  if (averageAmount == null) return null;
  const factor = PER_MONTH[frequency];
  if (factor == null) return null; // UNKNOWN frequency -> can't normalize
  return (Number(averageAmount) * factor).toFixed(2);
}

/** Shape we persist for a recurring stream (matches Prisma RecurringStream scalar fields). */
export interface RecurringStreamRecord {
  accountId: string;
  plaidStreamId: string;
  direction: RecurringDirection;
  description: string;
  merchantName: string | null;
  category: string | null;
  frequency: string;
  status: string;
  isActive: boolean;
  firstDate: Date;
  lastDate: Date;
  predictedNextDate: Date | null;
  averageAmount: string | null;
  lastAmount: string | null;
  currency: string | null;
}

/**
 * Map a Plaid recurring stream into our persistence shape. `accountId` is our uuid
 * (resolved by the caller). Amounts are Plaid-positive magnitudes; `direction`
 * carries the sign meaning.
 */
export function mapTransactionStream(
  accountId: string,
  direction: RecurringDirection,
  s: TransactionStream,
): RecurringStreamRecord {
  return {
    accountId,
    plaidStreamId: s.stream_id,
    direction,
    description: s.description,
    merchantName: s.merchant_name ?? null,
    category: s.personal_finance_category?.primary ?? s.category?.[0] ?? null,
    frequency: String(s.frequency),
    status: String(s.status),
    isActive: s.is_active,
    firstDate: plaidDate(s.first_date) ?? new Date(0),
    lastDate: plaidDate(s.last_date) ?? new Date(0),
    predictedNextDate: plaidDate(s.predicted_next_date),
    // Plaid signs amounts by its money-out-is-positive convention (inflow streams
    // are negative). We store positive magnitudes; `direction` carries the sign.
    averageAmount: s.average_amount?.amount != null ? Math.abs(s.average_amount.amount).toString() : null,
    lastAmount: s.last_amount?.amount != null ? Math.abs(s.last_amount.amount).toString() : null,
    currency:
      s.average_amount?.iso_currency_code ?? s.average_amount?.unofficial_currency_code ?? null,
  };
}
