import { useMemo } from "react";
import { useCashFlow } from "@/lib/queries";
import { EmptyRow, WidgetCard, WidgetEyebrow, WidgetSkeletonRows } from "./widget-card";

function last6MonthsRange() {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth() - 5, 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

export function CashFlowWidget() {
  const { startDate, endDate } = useMemo(last6MonthsRange, []);
  const { data, isLoading } = useCashFlow(startDate, endDate);
  const months = (data ?? []).slice(-6);
  const max = months.reduce((m, p) => Math.max(m, Number(p.income), Number(p.outflow)), 0);

  return (
    <WidgetCard>
      <WidgetEyebrow>Cash Flow</WidgetEyebrow>
      {isLoading ? (
        <div className="mt-4">
          <WidgetSkeletonRows count={1} />
        </div>
      ) : months.length === 0 ? (
        <div className="mt-4">
          <EmptyRow>No cash flow data yet.</EmptyRow>
        </div>
      ) : (
        <>
          <div className="mt-4 flex h-[110px] items-end gap-2.5">
            {months.map((m) => {
              const incomePct = max > 0 ? Math.round((Number(m.income) / max) * 100) : 0;
              const outflowPct = max > 0 ? Math.round((Number(m.outflow) / max) * 100) : 0;
              const label = new Intl.DateTimeFormat(navigator.language, { month: "short" }).format(
                new Date(`${m.month}-01T00:00:00`),
              );
              return (
                <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <div className="flex h-20 items-end gap-[3px]">
                    <div className="w-[9px] rounded-t-[3px] bg-success" style={{ height: `${incomePct}%` }} />
                    <div className="w-[9px] rounded-t-[3px] bg-text-faint" style={{ height: `${outflowPct}%` }} />
                  </div>
                  <div className="text-[10px] text-text-faint">{label}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex gap-4 text-[11px] text-text-muted">
            <div className="flex items-center gap-[5px]">
              <div className="h-[7px] w-[7px] rounded-[2px] bg-success" />
              Income
            </div>
            <div className="flex items-center gap-[5px]">
              <div className="h-[7px] w-[7px] rounded-[2px] bg-text-faint" />
              Outflow
            </div>
          </div>
        </>
      )}
    </WidgetCard>
  );
}
