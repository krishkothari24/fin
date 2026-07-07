import { Transaction } from "plaid";

/** Shape we persist for a transaction (matches Prisma Transaction scalar fields). */
export interface TransactionRecord {
  accountId: string; // our Account.id (uuid), not Plaid's account_id
  plaidTransactionId: string;
  amount: string; // Plaid sign: positive = money OUT. Kept as string for Decimal precision.
  currency: string | null;
  date: Date;
  authorizedDate: Date | null;
  name: string;
  merchantName: string | null;
  pending: boolean;
  pfcPrimary: string | null;
  pfcDetailed: string | null;
  paymentChannel: string | null;
}

/** Parse a Plaid `YYYY-MM-DD` date string into a UTC-midnight Date (for @db.Date). */
function plaidDate(d: string): Date {
  return new Date(`${d}T00:00:00.000Z`);
}

/**
 * Map a Plaid transaction into our persistence shape. Pure — no I/O.
 * `accountId` is our internal Account uuid (the caller resolves it from
 * Plaid's `t.account_id`).
 */
export function mapPlaidTransaction(accountId: string, t: Transaction): TransactionRecord {
  return {
    accountId,
    plaidTransactionId: t.transaction_id,
    amount: t.amount.toString(),
    currency: t.iso_currency_code ?? t.unofficial_currency_code ?? null,
    date: plaidDate(t.date),
    authorizedDate: t.authorized_date ? plaidDate(t.authorized_date) : null,
    name: t.name,
    merchantName: t.merchant_name ?? null,
    pending: t.pending,
    pfcPrimary: t.personal_finance_category?.primary ?? null,
    pfcDetailed: t.personal_finance_category?.detailed ?? null,
    paymentChannel: t.payment_channel ? String(t.payment_channel) : null,
  };
}
