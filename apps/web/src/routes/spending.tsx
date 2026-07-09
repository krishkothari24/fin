import { useMemo, useState } from "react";
import { useSpending } from "@/lib/queries";
import { formatMoney } from "@/lib/format";

const RANGES = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

function rangeToDates(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

export function SpendingRoute() {
  const [days, setDays] = useState(30);
  const { startDate, endDate } = useMemo(() => rangeToDates(days), [days]);
  const { data, isLoading } = useSpending(startDate, endDate);

  const categories = data ?? [];
  const total = categories.reduce((sum, c) => sum + Number(c.amount), 0);
  const max = categories.length ? Number(categories[0].amount) : 0;

  return (
    <div className="animate-[fadeIn_0.25s_ease]">
      <div className="mb-[18px] flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-bold tracking-[-0.01em] text-text-primary">Spending</h1>
          <p className="mt-[3px] text-[13px] text-text-muted">Where your money is going, by category.</p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-lg border border-white/[0.08] bg-surface px-3 py-2.5 text-[13px] text-text-primary outline-none"
        >
          {RANGES.map((r) => (
            <option key={r.days} value={r.days}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-[14px] border border-border-subtle bg-surface px-6 py-6">
        <div className="mb-5 flex items-baseline justify-between">
          <div className="text-[12.5px] font-semibold uppercase tracking-[0.04em] text-text-muted">
            Total spending
          </div>
          <div className="tabular-nums text-[22px] font-bold text-text-primary">{formatMoney(total, "USD")}</div>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[34px] animate-pulse rounded-md bg-white/[0.03]" />
            ))}
          </div>
        ) : categories.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-text-faint">No spending in this range.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {categories.map((cat) => {
              const pct = max > 0 ? Math.round((Number(cat.amount) / max) * 100) : 0;
              const share = total > 0 ? Math.round((Number(cat.amount) / total) * 100) : 0;
              return (
                <div key={cat.category}>
                  <div className="mb-1.5 flex justify-between text-[13px]">
                    <span className="font-medium text-text-secondary-strong">{cat.category}</span>
                    <span className="tabular-nums text-text-muted">
                      <span className="font-semibold text-text-primary">{formatMoney(cat.amount, "USD")}</span>
                      {"  "}· {share}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
