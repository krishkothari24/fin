import { AccountBase } from "plaid";

/** Shape we persist for an account (matches Prisma Account scalar fields). */
export interface AccountRecord {
  itemId: string;
  plaidAccountId: string;
  name: string;
  officialName: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  currentBalance: number | null;
  availableBalance: number | null;
  currency: string;
}

/** Map a Plaid account into our persistence shape. Pure — no I/O. */
export function mapPlaidAccount(itemId: string, a: AccountBase): AccountRecord {
  return {
    itemId,
    plaidAccountId: a.account_id,
    name: a.name,
    officialName: a.official_name ?? null,
    mask: a.mask ?? null,
    type: String(a.type),
    subtype: a.subtype ? String(a.subtype) : null,
    currentBalance: a.balances.current ?? null,
    availableBalance: a.balances.available ?? null,
    currency: a.balances.iso_currency_code ?? "USD",
  };
}
