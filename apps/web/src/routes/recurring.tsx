import { useState } from "react";
import type { RecurringStreamDto } from "@fin/shared";
import { useRecurring } from "@/lib/queries";
import { directionalAmount, formatDate, formatMoney } from "@/lib/format";

function StreamRow({ stream, currency }: { stream: RecurringStreamDto; currency: string }) {
  const { text, color } = directionalAmount(stream.averageAmount ?? "0", stream.currency ?? currency, stream.direction);
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.03] px-5 py-3.5 last:border-b-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-medium text-text-primary">{stream.description}</span>
          {!stream.isActive && (
            <span className="shrink-0 rounded-[5px] bg-white/5 px-1.5 py-0.5 text-[10px] text-text-faint">
              Inactive
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[11.5px] text-text-faint">
          {stream.frequency.replace(/_/g, " ").toLowerCase()}
          {stream.predictedNextDate && ` · Next ${formatDate(stream.predictedNextDate)}`}
        </div>
      </div>
      <div className={`tabular-nums shrink-0 text-[13.5px] font-semibold ${color}`}>{text}/mo</div>
    </div>
  );
}

export function RecurringRoute() {
  const [activeOnly, setActiveOnly] = useState(true);
  const { data, isLoading } = useRecurring(activeOnly);
  const currency = data?.totals.currency ?? "USD";

  return (
    <div className="animate-[fadeIn_0.25s_ease]">
      <div className="mb-[18px] flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-bold tracking-[-0.01em] text-text-primary">Recurring</h1>
          <p className="mt-[3px] text-[13px] text-text-muted">Subscriptions, bills, and paychecks Plaid detected.</p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-[12.5px] font-medium text-text-secondary">
          <input
            type="checkbox"
            checked={!activeOnly}
            onChange={(e) => setActiveOnly(!e.target.checked)}
            className="h-3.5 w-3.5 accent-accent"
          />
          Include inactive streams
        </label>
      </div>

      {isLoading || !data ? (
        <div className="h-[300px] animate-pulse rounded-[14px] bg-surface" />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
            <div className="rounded-[14px] border border-border-subtle bg-surface px-5 py-[18px]">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                Monthly inflow
              </div>
              <div className="tabular-nums mt-1.5 text-[22px] font-bold text-success">
                {formatMoney(data.totals.monthlyInflow, currency)}
              </div>
            </div>
            <div className="rounded-[14px] border border-border-subtle bg-surface px-5 py-[18px]">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                Monthly outflow
              </div>
              <div className="tabular-nums mt-1.5 text-[22px] font-bold text-danger">
                {formatMoney(data.totals.monthlyOutflow, currency)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
            <div className="rounded-[14px] border border-border-subtle bg-surface">
              <div className="border-b border-white/[0.06] px-5 py-3.5 text-[12.5px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                Inflows
              </div>
              {data.inflows.length === 0 ? (
                <p className="px-5 py-8 text-center text-[12.5px] text-text-faint">No inflow streams.</p>
              ) : (
                data.inflows.map((s) => <StreamRow key={s.id} stream={s} currency={currency} />)
              )}
            </div>
            <div className="rounded-[14px] border border-border-subtle bg-surface">
              <div className="border-b border-white/[0.06] px-5 py-3.5 text-[12.5px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                Outflows
              </div>
              {data.outflows.length === 0 ? (
                <p className="px-5 py-8 text-center text-[12.5px] text-text-faint">No outflow streams.</p>
              ) : (
                data.outflows.map((s) => <StreamRow key={s.id} stream={s} currency={currency} />)
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
