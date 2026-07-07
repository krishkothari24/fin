/**
 * Shared types / API contract for the fin-dashboard.
 * Imported by the NestJS API today and the web app later.
 */

// ---- domain enums -------------------------------------------------------

export type ItemStatus = "good" | "login_required" | "error";

/** Plaid high-level account types. Used to split assets vs liabilities. */
export type AccountType = "depository" | "credit" | "loan" | "investment" | "other";

/** depository + investment are assets; credit + loan are liabilities. */
export const LIABILITY_TYPES: AccountType[] = ["credit", "loan"];

// ---- DTOs (API responses) ----------------------------------------------

export interface AccountDto {
  id: string;
  name: string;
  officialName: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  currentBalance: string | null;
  availableBalance: string | null;
  currency: string | null;
  isHidden: boolean;
  institutionName: string | null;
}

export interface TransactionDto {
  id: string;
  accountId: string;
  amount: string; // Plaid sign: positive = money out of the account
  currency: string | null;
  date: string; // ISO date
  name: string;
  merchantName: string | null;
  pending: boolean;
  category: { primary: string | null; detailed: string | null };
}

export interface NetWorthDto {
  asOf: string;
  assets: string;
  liabilities: string;
  netWorth: string;
  currency: string;
  series?: Array<{ date: string; netWorth: string }>;
}

export interface CategorySpendDto {
  category: string;
  amount: string;
}

// ---- dashboard config ("choose what to show") --------------------------

export type WidgetId =
  | "net_worth"
  | "accounts"
  | "spending_by_category"
  | "recent_transactions"
  | "cash_flow"
  | "recurring";

export interface DashboardConfig {
  widgets: Array<{ id: WidgetId; enabled: boolean; order: number }>;
  hiddenAccountIds: string[];
  defaultRangeDays: number;
  currency: string;
}

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  widgets: [
    { id: "net_worth", enabled: true, order: 0 },
    { id: "accounts", enabled: true, order: 1 },
    { id: "spending_by_category", enabled: true, order: 2 },
    { id: "recent_transactions", enabled: true, order: 3 },
    { id: "cash_flow", enabled: true, order: 4 },
    { id: "recurring", enabled: false, order: 5 },
  ],
  hiddenAccountIds: [],
  defaultRangeDays: 30,
  currency: "USD",
};
