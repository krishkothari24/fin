import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  AccountDto,
  NetWorthDto,
  CategorySpendDto,
  CashFlowPointDto,
  TransactionsPage,
  LiabilitiesResponse,
  DashboardConfig,
  HoldingsResponse,
  RecurringResponse,
  InvestmentTransactionsPage,
  ManualAssetsResponse,
  BudgetsResponse,
  GoalDto,
} from "@fin/shared";
import { api } from "./api";

export interface ItemSummary {
  id: string;
  institutionName: string | null;
  status: "good" | "login_required" | "error";
  lastSyncedAt: string | null;
  accounts: number;
}

export function useItems() {
  return useQuery({
    queryKey: ["items"],
    queryFn: () => api.get<ItemSummary[]>("/items"),
    refetchInterval: (query) =>
      query.state.data?.some((item) => item.lastSyncedAt === null) ? 3000 : false,
  });
}

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.get<AccountDto[]>("/accounts"),
  });
}

export function useNetWorth(series = false) {
  return useQuery({
    queryKey: ["net-worth", series],
    queryFn: () => api.get<NetWorthDto>("/aggregations/net-worth", { series }),
  });
}

export function useSpending(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["spending", startDate, endDate],
    queryFn: () => api.get<CategorySpendDto[]>("/aggregations/spending", { startDate, endDate }),
  });
}

export function useCashFlow(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["cash-flow", startDate, endDate],
    queryFn: () => api.get<CashFlowPointDto[]>("/aggregations/cash-flow", { startDate, endDate }),
  });
}

export function useRecentTransactions(limit = 5) {
  return useQuery({
    queryKey: ["transactions", "recent", limit],
    queryFn: () => api.get<TransactionsPage>("/transactions", { limit, offset: 0 }),
  });
}

export interface TransactionsFilters {
  search?: string;
  accountId?: string;
  category?: string;
  pending?: boolean;
  startDate?: string;
  endDate?: string;
  limit: number;
  offset: number;
}

export function useTransactions(filters: TransactionsFilters) {
  return useQuery({
    queryKey: ["transactions", "list", filters],
    queryFn: () => api.get<TransactionsPage>("/transactions", { ...filters }),
    placeholderData: keepPreviousData,
  });
}

export function useLiabilities() {
  return useQuery({
    queryKey: ["liabilities"],
    queryFn: () => api.get<LiabilitiesResponse>("/liabilities"),
  });
}

export function useHoldings() {
  return useQuery({
    queryKey: ["holdings"],
    queryFn: () => api.get<HoldingsResponse>("/investments/holdings"),
  });
}

export interface InvestmentTransactionsFilters {
  startDate?: string;
  endDate?: string;
  accountId?: string;
  type?: string;
  limit: number;
  offset: number;
}

export function useInvestmentTransactions(filters: InvestmentTransactionsFilters) {
  return useQuery({
    queryKey: ["investment-transactions", filters],
    queryFn: () => api.get<InvestmentTransactionsPage>("/investments/transactions", { ...filters }),
    placeholderData: keepPreviousData,
  });
}

export function useRecurring(activeOnly = true) {
  return useQuery({
    queryKey: ["recurring", activeOnly],
    queryFn: () => api.get<RecurringResponse>("/recurring", { activeOnly }),
  });
}

export function useManualAssets() {
  return useQuery({
    queryKey: ["manual-assets"],
    queryFn: () => api.get<ManualAssetsResponse>("/manual-assets"),
  });
}

export function useBudgets(month?: string) {
  return useQuery({
    queryKey: ["budgets", month],
    queryFn: () => api.get<BudgetsResponse>("/budgets", { month }),
  });
}

export function useGoals() {
  return useQuery({
    queryKey: ["goals"],
    queryFn: () => api.get<GoalDto[]>("/goals"),
  });
}

export function useDashboardConfig() {
  return useQuery({
    queryKey: ["dashboard-config"],
    queryFn: () => api.get<DashboardConfig>("/dashboard/config"),
  });
}
