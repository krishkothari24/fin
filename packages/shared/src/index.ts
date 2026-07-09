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

/** One line of a user-split transaction. See TransactionDto.splits. */
export interface TransactionSplitDto {
  id: string;
  amount: string;
  category: string | null;
  note: string | null;
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
  /** `primary` reflects the user's category override when one is set, else Plaid's. */
  category: { primary: string | null; detailed: string | null };
  note: string | null;
  tags: string[];
  /** Empty when the transaction hasn't been split. Amounts sum to `amount`. */
  splits: TransactionSplitDto[];
}

/** PATCH /transactions/:id body — all fields optional. */
export interface UpdateTransactionDetailDto {
  note?: string | null;
  categoryOverride?: string | null;
  tags?: string[];
}

/** PUT /transactions/:id/splits body — full replacement set. */
export interface SetTransactionSplitsDto {
  splits: Array<{ amount: string; category?: string; note?: string }>;
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

// ---- liabilities (Plaid Liabilities product) ---------------------------

export type LiabilityKind = "credit" | "student" | "mortgage";

/** Liability detail for one account. Money/rates as strings; dates ISO (YYYY-MM-DD). */
export interface LiabilityDto {
  id: string;
  accountId: string;
  accountName: string;
  mask: string | null;
  kind: LiabilityKind;
  /** Outstanding balance (from the account itself). */
  currentBalance: string | null;
  /** Representative APR / interest rate as a percentage (credit: purchase APR). */
  aprPercentage: string | null;
  lastPaymentAmount: string | null;
  lastPaymentDate: string | null;
  lastStatementBalance: string | null;
  lastStatementIssueDate: string | null;
  minimumPaymentAmount: string | null;
  nextPaymentDueDate: string | null;
  isOverdue: boolean | null;
  currency: string | null;
}

/** All liabilities for the user plus a debt total. */
export interface LiabilitiesResponse {
  liabilities: LiabilityDto[];
  totals: {
    totalDebt: string; // sum of outstanding balances across liability accounts
    minimumPaymentDue: string; // sum of minimum payments
    currency: string;
  };
}

// ---- recurring transactions (Plaid Recurring Transactions) -------------

export type RecurringDirection = "inflow" | "outflow";
export type RecurringFrequency =
  | "UNKNOWN"
  | "WEEKLY"
  | "BIWEEKLY"
  | "SEMI_MONTHLY"
  | "MONTHLY"
  | "ANNUALLY";

/** One recurring stream (subscription / paycheck / bill). Amounts as strings. */
export interface RecurringStreamDto {
  id: string;
  accountId: string;
  direction: RecurringDirection;
  description: string;
  merchantName: string | null;
  category: string | null;
  frequency: RecurringFrequency | string;
  status: string;
  isActive: boolean;
  firstDate: string;
  lastDate: string;
  predictedNextDate: string | null;
  averageAmount: string | null; // positive magnitude; use `direction` for sign
  lastAmount: string | null;
  /** `averageAmount` normalized to a per-month figure using `frequency`. */
  monthlyEstimate: string | null;
  currency: string | null;
}

/** Recurring streams split by direction, with normalized monthly totals. */
export interface RecurringResponse {
  inflows: RecurringStreamDto[];
  outflows: RecurringStreamDto[];
  totals: {
    monthlyInflow: string; // active inflow streams, normalized to per-month
    monthlyOutflow: string; // active outflow streams, normalized to per-month
    currency: string;
  };
}

// ---- manual assets & liabilities (user-entered, off-platform net worth) ----

export type ManualAssetKind = "asset" | "liability";
export type ManualAssetCategory =
  | "real_estate"
  | "vehicle"
  | "cash"
  | "crypto"
  | "other_asset"
  | "loan"
  | "credit_debt"
  | "other_liability";

/** Runtime list of every ManualAssetCategory (for validation). */
export const MANUAL_ASSET_CATEGORIES: ManualAssetCategory[] = [
  "real_estate",
  "vehicle",
  "cash",
  "crypto",
  "other_asset",
  "loan",
  "credit_debt",
  "other_liability",
];

/** A user-entered, off-platform net-worth item (not synced from Plaid). */
export interface ManualAssetDto {
  id: string;
  name: string;
  kind: ManualAssetKind;
  category: ManualAssetCategory;
  currentValue: string;
  currency: string | null;
  notes: string | null;
  updatedAt: string;
}

export interface CreateManualAssetDto {
  name: string;
  kind: ManualAssetKind;
  category: ManualAssetCategory;
  currentValue: string;
  currency?: string;
  notes?: string;
}

export type UpdateManualAssetDto = Partial<CreateManualAssetDto>;

/** All manual entries for the user, split by kind, plus net totals. */
export interface ManualAssetsResponse {
  assets: ManualAssetDto[];
  liabilities: ManualAssetDto[];
  totals: {
    assetsValue: string;
    liabilitiesValue: string;
    currency: string;
  };
}

// ---- budgets (monthly spend limit per Plaid PFC category) --------------

/** Plaid's fixed personal_finance_category primary values. */
export const PLAID_PRIMARY_CATEGORIES = [
  "INCOME",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "LOAN_PAYMENTS",
  "BANK_FEES",
  "ENTERTAINMENT",
  "FOOD_AND_DRINK",
  "GENERAL_MERCHANDISE",
  "HOME_IMPROVEMENT",
  "MEDICAL",
  "PERSONAL_CARE",
  "GENERAL_SERVICES",
  "GOVERNMENT_AND_NON_PROFIT",
  "TRANSPORTATION",
  "TRAVEL",
  "RENT_AND_UTILITIES",
  "OTHER",
] as const;
export type PlaidPrimaryCategory = (typeof PLAID_PRIMARY_CATEGORIES)[number];

/** One category's budget vs. actual spend for the requested month. */
export interface BudgetDto {
  category: PlaidPrimaryCategory | string;
  monthlyLimit: string;
  spent: string;
  remaining: string; // monthlyLimit - spent (can be negative when over)
  percentUsed: number; // spent / monthlyLimit * 100, uncapped
  currency: string;
}

export interface BudgetsResponse {
  month: string; // YYYY-MM
  budgets: BudgetDto[];
}

// ---- goals (savings target / debt payoff) -------------------------------

export type GoalKind = "savings" | "debt_payoff";

/**
 * A savings target or debt-payoff goal. `currentAmount`/`progressPercent` are
 * computed on read: from the linked account's live balance when `linkedAccountId`
 * is set, else from `currentAmountOverride`. For `debt_payoff`, `currentAmount`
 * is the amount paid down (targetAmount - remaining balance), not the balance.
 */
export interface GoalDto {
  id: string;
  name: string;
  kind: GoalKind;
  targetAmount: string;
  targetDate: string | null; // ISO date
  linkedAccountId: string | null;
  linkedAccountName: string | null;
  currentAmount: string;
  progressPercent: number; // uncapped; a debt paid down past target can exceed 100
  notes: string | null;
  currency: string;
  updatedAt: string;
}

export interface CreateGoalDto {
  name: string;
  kind: GoalKind;
  targetAmount: string;
  targetDate?: string;
  linkedAccountId?: string;
  currentAmountOverride?: string;
  notes?: string;
}

export type UpdateGoalDto = Partial<CreateGoalDto>;

// ---- dashboard config ("choose what to show") --------------------------

export type WidgetId =
  | "net_worth"
  | "accounts"
  | "spending_by_category"
  | "recent_transactions"
  | "cash_flow"
  | "holdings"
  | "liabilities"
  | "recurring"
  | "manual_assets"
  | "budgets"
  | "goals";

/** Runtime list of every WidgetId (for validation). Keep in sync with WidgetId. */
export const WIDGET_IDS: WidgetId[] = [
  "net_worth",
  "accounts",
  "spending_by_category",
  "recent_transactions",
  "cash_flow",
  "holdings",
  "liabilities",
  "recurring",
  "manual_assets",
  "budgets",
  "goals",
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
    { id: "liabilities", enabled: false, order: 6 },
    { id: "recurring", enabled: false, order: 7 },
    { id: "manual_assets", enabled: false, order: 8 },
    { id: "budgets", enabled: false, order: 9 },
    { id: "goals", enabled: false, order: 10 },
  ],
  hiddenAccountIds: [],
  defaultRangeDays: 30,
  currency: "USD",
};
