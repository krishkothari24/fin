import type { ComponentType } from "react";
import type { WidgetId } from "@fin/shared";
import { useDashboardConfig } from "@/lib/queries";
import { NetWorthWidget } from "@/components/dashboard/net-worth-widget";
import { AccountsWidget } from "@/components/dashboard/accounts-widget";
import { SpendingWidget } from "@/components/dashboard/spending-widget";
import { RecentTransactionsWidget } from "@/components/dashboard/recent-transactions-widget";
import { CashFlowWidget } from "@/components/dashboard/cash-flow-widget";
import { LiabilitiesWidget } from "@/components/dashboard/liabilities-widget";
import { HoldingsWidget } from "@/components/dashboard/holdings-widget";
import { RecurringWidget } from "@/components/dashboard/recurring-widget";
import { ManualAssetsWidget } from "@/components/dashboard/manual-assets-widget";
import { BudgetsWidget } from "@/components/dashboard/budgets-widget";
import { GoalsWidget } from "@/components/dashboard/goals-widget";

const WIDGET_COMPONENTS: Record<WidgetId, ComponentType> = {
  net_worth: NetWorthWidget,
  accounts: AccountsWidget,
  spending_by_category: SpendingWidget,
  recent_transactions: RecentTransactionsWidget,
  cash_flow: CashFlowWidget,
  liabilities: LiabilitiesWidget,
  holdings: HoldingsWidget,
  recurring: RecurringWidget,
  manual_assets: ManualAssetsWidget,
  budgets: BudgetsWidget,
  goals: GoalsWidget,
};

export function DashboardRoute() {
  const { data: config, isLoading } = useDashboardConfig();

  const enabledWidgets = (config?.widgets ?? []).filter((w) => w.enabled).sort((a, b) => a.order - b.order);

  return (
    <div className="animate-[fadeIn_0.25s_ease]">
      <div className="mb-[22px]">
        <h1 className="text-[20px] font-bold tracking-[-0.01em] text-text-primary">Dashboard</h1>
        <p className="mt-[3px] text-[13px] text-text-muted">Here's where things stand today.</p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[180px] animate-pulse rounded-[14px] bg-surface" />
            ))
          : enabledWidgets.map((w) => {
              const Widget = WIDGET_COMPONENTS[w.id];
              return <Widget key={w.id} />;
            })}
      </div>
    </div>
  );
}
