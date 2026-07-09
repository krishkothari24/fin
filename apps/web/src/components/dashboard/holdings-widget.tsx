import { Link } from "react-router";
import { useHoldings } from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import { EmptyRow, WidgetCard, WidgetEyebrow, WidgetSkeletonRows } from "./widget-card";

export function HoldingsWidget() {
  const { data, isLoading } = useHoldings();
  const holdings = (data?.holdings ?? [])
    .slice()
    .sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0))
    .slice(0, 5);
  const currency = data?.totals.currency ?? "USD";

  return (
    <WidgetCard>
      <div className="mb-3.5 flex items-center justify-between">
        <WidgetEyebrow>Holdings</WidgetEyebrow>
        <Link to="/investments" className="text-[12px] font-semibold text-accent hover:text-accent-hover">
          View all
        </Link>
      </div>
      {isLoading ? (
        <WidgetSkeletonRows count={4} />
      ) : holdings.length === 0 ? (
        <EmptyRow>No holdings yet.</EmptyRow>
      ) : (
        <div className="flex flex-col gap-[11px]">
          {holdings.map((h) => {
            const gainLoss = h.gainLoss !== null ? Number(h.gainLoss) : null;
            return (
              <div key={h.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium">
                    {h.security.tickerSymbol && (
                      <span className="mr-1.5 text-accent">{h.security.tickerSymbol}</span>
                    )}
                    <span className="text-text-secondary-strong">{h.security.name ?? "—"}</span>
                  </div>
                  {gainLoss !== null && (
                    <div className={`text-[11px] ${gainLoss >= 0 ? "text-success" : "text-danger"}`}>
                      {gainLoss >= 0 ? "+" : "−"}
                      {formatMoney(Math.abs(gainLoss), h.currency ?? currency)}
                    </div>
                  )}
                </div>
                <div className="tabular-nums shrink-0 text-[13px] font-semibold text-text-primary">
                  {h.value ? formatMoney(h.value, h.currency ?? currency) : "—"}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </WidgetCard>
  );
}
