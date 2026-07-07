import {
  Holding as PlaidHolding,
  InvestmentTransaction as PlaidInvestmentTransaction,
  Security as PlaidSecurity,
} from "plaid";

/** Parse a Plaid `YYYY-MM-DD` date string into a UTC-midnight Date (for @db.Date). */
function plaidDate(d: string): Date {
  return new Date(`${d}T00:00:00.000Z`);
}

// --- securities ------------------------------------------------------------

/** Shape we persist for a security (matches Prisma Security scalar fields). */
export interface SecurityRecord {
  plaidSecurityId: string;
  name: string | null;
  tickerSymbol: string | null;
  type: string | null;
  closePrice: string | null;
  closePriceAsOf: Date | null;
  currency: string | null;
  isCashEquivalent: boolean;
  cusip: string | null;
  isin: string | null;
}

/** Map a Plaid security into our persistence shape. Pure — no I/O. */
export function mapPlaidSecurity(s: PlaidSecurity): SecurityRecord {
  return {
    plaidSecurityId: s.security_id,
    name: s.name ?? null,
    tickerSymbol: s.ticker_symbol ?? null,
    type: s.type ?? null,
    closePrice: s.close_price != null ? s.close_price.toString() : null,
    closePriceAsOf: s.close_price_as_of ? plaidDate(s.close_price_as_of) : null,
    currency: s.iso_currency_code ?? s.unofficial_currency_code ?? null,
    isCashEquivalent: s.is_cash_equivalent ?? false,
    cusip: s.cusip ?? null,
    isin: s.isin ?? null,
  };
}

// --- holdings --------------------------------------------------------------

/** Shape we persist for a holding. `accountId`/`securityId` are our uuids (resolved by the caller). */
export interface HoldingRecord {
  accountId: string;
  securityId: string;
  quantity: string;
  institutionPrice: string | null;
  institutionPriceAsOf: Date | null;
  institutionValue: string | null;
  costBasis: string | null;
  currency: string | null;
}

export function mapPlaidHolding(
  accountId: string,
  securityId: string,
  h: PlaidHolding,
): HoldingRecord {
  return {
    accountId,
    securityId,
    quantity: h.quantity.toString(),
    institutionPrice: h.institution_price != null ? h.institution_price.toString() : null,
    institutionPriceAsOf: h.institution_price_as_of
      ? plaidDate(h.institution_price_as_of)
      : null,
    institutionValue: h.institution_value != null ? h.institution_value.toString() : null,
    costBasis: h.cost_basis != null ? h.cost_basis.toString() : null,
    currency: h.iso_currency_code ?? h.unofficial_currency_code ?? null,
  };
}

// --- investment transactions ----------------------------------------------

/** Shape we persist for an investment transaction. `securityId` is our uuid or null (cash txns). */
export interface InvestmentTransactionRecord {
  accountId: string;
  securityId: string | null;
  plaidInvestmentTransactionId: string;
  type: string;
  subtype: string | null;
  quantity: string | null;
  amount: string; // Plaid sign: positive = cash OUT (e.g. a buy)
  price: string | null;
  fees: string | null;
  date: Date;
  name: string;
  currency: string | null;
}

export function mapPlaidInvestmentTransaction(
  accountId: string,
  securityId: string | null,
  t: PlaidInvestmentTransaction,
): InvestmentTransactionRecord {
  return {
    accountId,
    securityId,
    plaidInvestmentTransactionId: t.investment_transaction_id,
    type: String(t.type),
    subtype: t.subtype != null ? String(t.subtype) : null,
    quantity: t.quantity != null ? t.quantity.toString() : null,
    amount: t.amount.toString(),
    price: t.price != null ? t.price.toString() : null,
    fees: t.fees != null ? t.fees.toString() : null,
    date: plaidDate(t.date),
    name: t.name ?? String(t.type),
    currency: t.iso_currency_code ?? t.unofficial_currency_code ?? null,
  };
}
