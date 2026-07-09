import { useBudgets } from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import { categoryLabel } from "@/lib/schemas/budget";
import { EmptyRow, WidgetCard, WidgetEyebrow, WidgetSkeletonRows } from "./widget-card";

export function BudgetsWidget() {
  const { data, isLoading } = useBudgets();
  const budgets = [...(data?.budgets ?? [])].sort((a, b) => b.percentUsed - a.percentUsed).slice(0, 5);

  return (
    <WidgetCard span2>
      <div className="mb-3.5 flex items-center justify-between">
        <WidgetEyebrow>Budgets</WidgetEyebrow>
        {data && <span className="text-[12px] text-text-muted">{data.month}</span>}
      </div>
      {isLoading ? (
        <WidgetSkeletonRows count={3} />
      ) : budgets.length === 0 ? (
        <EmptyRow>No budgets set yet.</EmptyRow>
      ) : (
        <div className="flex flex-col gap-3">
          {budgets.map((b) => {
            const pct = Math.min(Math.round(b.percentUsed), 100);
            const over = b.percentUsed > 100;
            const barColor = over ? "bg-danger" : b.percentUsed >= 80 ? "bg-alert" : "bg-accent";
            return (
              <div key={b.category}>
                <div className="mb-1 flex items-baseline justify-between text-[12.5px]">
                  <span className="font-medium text-text-secondary-strong">{categoryLabel(b.category)}</span>
                  <span className={`tabular-nums ${over ? "text-danger" : "text-text-muted"}`}>
                    {formatMoney(b.spent, b.currency)} / {formatMoney(b.monthlyLimit, b.currency)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </WidgetCard>
  );
}
