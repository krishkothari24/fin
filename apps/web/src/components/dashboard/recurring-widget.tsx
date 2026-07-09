import { useRecurring } from "@/lib/queries";
import { directionalAmount, formatDate, formatMoney } from "@/lib/format";
import { EmptyRow, WidgetCard, WidgetEyebrow, WidgetSkeletonRows } from "./widget-card";

export function RecurringWidget() {
  const { data, isLoading } = useRecurring();
  const currency = data?.totals.currency ?? "USD";
  const streams = [...(data?.inflows ?? []), ...(data?.outflows ?? [])]
    .filter((s) => s.predictedNextDate)
    .sort((a, b) => (a.predictedNextDate ?? "").localeCompare(b.predictedNextDate ?? ""))
    .slice(0, 5);

  return (
    <WidgetCard>
      <WidgetEyebrow>Recurring</WidgetEyebrow>
      {isLoading ? (
        <div className="mt-3">
          <WidgetSkeletonRows count={4} />
        </div>
      ) : !data || (data.inflows.length === 0 && data.outflows.length === 0) ? (
        <div className="mt-3">
          <EmptyRow>No recurring streams detected yet.</EmptyRow>
        </div>
      ) : (
        <>
          <div className="mt-2 flex gap-[18px]">
            <div>
              <div className="text-[11px] text-text-faint">Monthly inflow</div>
              <div className="tabular-nums text-[13px] font-semibold text-success">
                {formatMoney(data.totals.monthlyInflow, currency)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-text-faint">Monthly outflow</div>
              <div className="tabular-nums text-[13px] font-semibold text-danger">
                {formatMoney(data.totals.monthlyOutflow, currency)}
              </div>
            </div>
          </div>
          <div className="mt-3.5 flex flex-col gap-2.5">
            {streams.map((s) => {
              const { text, color } = directionalAmount(s.averageAmount ?? "0", s.currency ?? currency, s.direction);
              return (
                <div key={s.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-text-primary">{s.description}</div>
                    <div className="text-[11px] text-text-faint">
                      Next {s.predictedNextDate ? formatDate(s.predictedNextDate) : "—"}
                    </div>
                  </div>
                  <div className={`tabular-nums shrink-0 text-[13px] font-semibold ${color}`}>{text}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </WidgetCard>
  );
}
