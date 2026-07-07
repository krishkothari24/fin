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

/** One month of cash flow. `net` = income - outflow (both non-negative). */
export interface CashFlowPointDto {
  month: string; // YYYY-MM
  income: string; // money in  (Plaid amount < 0, sign flipped)
  outflow: string; // money out (Plaid amount > 0)
  net: string;
}

/** A page of transactions (offset pagination). */
export interface TransactionsPage {
  transactions: TransactionDto[];
  total: number;
  limit: number;
  offset: number;
}

// ---- investments (Plaid Investments product) ---------------------------

export interface SecurityDto {
  id: string;
  tickerSymbol: string | null;
  name: string | null;
  type: string | null;
  closePrice: string | null;
  currency: string | null;
}

/** One position: a quantity of one security in one account. Money as strings. */
export interface HoldingDto {
  id: string;
  accountId: string;
  security: SecurityDto;
  quantity: string;
  institutionPrice: string | null;
  value: string | null; // institution_value (market value)
  costBasis: string | null;
  gainLoss: string | null; // value - costBasis, when both known
  currency: string | null;
}

/** Holdings for the user plus portfolio totals. */
export interface HoldingsResponse {
  holdings: HoldingDto[];
  totals: {
    value: string;
    costBasis: string;
    gainLoss: string;
    currency: string;
  };
}

export interface InvestmentTransactionDto {
  id: string;
  accountId: string;
  security: { tickerSymbol: string | null; name: string | null } | null;
  type: string; // buy | sell | cash | fee | transfer | cancel
  subtype: string | null;
  quantity: string | null;
  amount: string; // Plaid sign: positive = cash out of the account
  price: string | null;
  fees: string | null;
  date: string; // ISO date
  name: string;
  currency: string | null;
}

/** A page of investment transactions (offset pagination). */
export interface InvestmentTransactionsPage {
  transactions: InvestmentTransactionDto[];
  total: number;
  limit: number;
  offset: number;
}

// ---- dashboard config ("choose what to show") --------------------------

export type WidgetId =
  | "net_worth"
  | "accounts"
  | "spending_by_category"
  | "recent_transactions"
  | "cash_flow"
  | "holdings"
  | "recurring";

/** Runtime list of every WidgetId (for validation). Keep in sync with WidgetId. */
export const WIDGET_IDS: WidgetId[] = [
  "net_worth",
  "accounts",
  "spending_by_category",
  "recent_transactions",
  "cash_flow",
  "holdings",
  "recurring",
];

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
    { id: "holdings", enabled: false, order: 5 },
    { id: "recurring", enabled: false, order: 6 },
  ],
  hiddenAccountIds: [],
  defaultRangeDays: 30,
  currency: "USD",
};
