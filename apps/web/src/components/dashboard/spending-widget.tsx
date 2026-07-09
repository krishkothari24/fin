import { useMemo } from "react";
import { useDashboardConfig, useSpending } from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import { EmptyRow, WidgetCard, WidgetEyebrow, WidgetSkeletonRows } from "./widget-card";

function last30DaysRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

export function SpendingWidget() {
  const { startDate, endDate } = useMemo(last30DaysRange, []);
  const { data, isLoading } = useSpending(startDate, endDate);
  const { data: config } = useDashboardConfig();
  const currency = config?.currency ?? "USD";

  const categories = data ?? [];
  const max = categories.length ? Number(categories[0].amount) : 0;

  return (
    <WidgetCard>
      <div className="mb-3.5 flex items-center justify-between">
        <WidgetEyebrow>Spending by Category</WidgetEyebrow>
        <span className="text-[11px] text-text-faint">Last 30 days</span>
      </div>
      {isLoading ? (
        <WidgetSkeletonRows count={5} />
      ) : categories.length === 0 ? (
        <EmptyRow>No spending in the last 30 days.</EmptyRow>
      ) : (
        <div className="flex flex-col gap-3">
          {categories.map((cat) => {
            const pct = max > 0 ? Math.round((Number(cat.amount) / max) * 100) : 0;
            return (
              <div key={cat.category}>
                <div className="mb-1 flex justify-between text-[12.5px]">
                  <span className="text-text-secondary-strong">{cat.category}</span>
                  <span className="tabular-nums font-semibold text-text-primary">
                    {formatMoney(cat.amount, currency)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </WidgetCard>
  );
}
