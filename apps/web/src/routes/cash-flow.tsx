import { useMemo } from "react";
import { useCashFlow } from "@/lib/queries";
import { formatMoney } from "@/lib/format";

function monthsAgoRange(months: number) {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth() - (months - 1), 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

function monthLabel(month: string) {
  return new Intl.DateTimeFormat(navigator.language, { month: "short", year: "2-digit" }).format(
    new Date(`${month}-01T00:00:00`),
  );
}

const LINE_WIDTH = 860;
const LINE_HEIGHT = 100;
const LINE_PAD = 12;

export function CashFlowRoute() {
  const { startDate, endDate } = useMemo(() => monthsAgoRange(6), []);
  const { data, isLoading } = useCashFlow(startDate, endDate);

  const months = (data ?? []).slice(-6);
  const barMax = months.reduce((m, p) => Math.max(m, Number(p.income), Number(p.outflow)), 0);

  const netValues = months.map((m) => Number(m.net));
  const netMin = Math.min(0, ...netValues);
  const netMax = Math.max(0, ...netValues);
  const netPoints =
    months.length >= 2
      ? netValues
          .map((v, i) => {
            const x = (i / (netValues.length - 1)) * (LINE_WIDTH - LINE_PAD * 2) + LINE_PAD;
            const y =
              LINE_HEIGHT -
              LINE_PAD -
              ((v - netMin) / (netMax - netMin || 1)) * (LINE_HEIGHT - LINE_PAD * 2);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ")
      : null;

  const totalIncome = months.reduce((s, m) => s + Number(m.income), 0);
  const totalOutflow = months.reduce((s, m) => s + Number(m.outflow), 0);

  return (
    <div className="animate-[fadeIn_0.25s_ease]">
      <div className="mb-[18px]">
        <h1 className="text-[20px] font-bold tracking-[-0.01em] text-text-primary">Cash Flow</h1>
        <p className="mt-[3px] text-[13px] text-text-muted">Income vs. outflow over the last 6 months.</p>
      </div>

      {isLoading ? (
        <div className="h-[420px] animate-pulse rounded-[14px] bg-surface" />
      ) : months.length === 0 ? (
        <div className="rounded-[14px] border border-border-subtle bg-surface px-6 py-14 text-center">
          <p className="text-[13px] text-text-faint">No cash flow data yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            <div className="rounded-[14px] border border-border-subtle bg-surface px-5 py-[18px]">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                Total income
              </div>
              <div className="tabular-nums mt-1.5 text-[22px] font-bold text-success">
                {formatMoney(totalIncome, "USD")}
              </div>
            </div>
            <div className="rounded-[14px] border border-border-subtle bg-surface px-5 py-[18px]">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                Total outflow
              </div>
              <div className="tabular-nums mt-1.5 text-[22px] font-bold text-danger">
                {formatMoney(totalOutflow, "USD")}
              </div>
            </div>
            <div className="rounded-[14px] border border-border-subtle bg-surface px-5 py-[18px]">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                Net
              </div>
              <div
                className={`tabular-nums mt-1.5 text-[22px] font-bold ${
                  totalIncome - totalOutflow >= 0 ? "text-success" : "text-danger"
                }`}
              >
                {formatMoney(totalIncome - totalOutflow, "USD")}
              </div>
            </div>
          </div>

          <div className="rounded-[14px] border border-border-subtle bg-surface px-6 py-6">
            <div className="mb-4 text-[12.5px] font-semibold uppercase tracking-[0.04em] text-text-muted">
              Income vs. Outflow
            </div>
            <div className="flex h-[220px] items-end gap-6">
              {months.map((m) => {
                const incomePct = barMax > 0 ? (Number(m.income) / barMax) * 100 : 0;
                const outflowPct = barMax > 0 ? (Number(m.outflow) / barMax) * 100 : 0;
                return (
                  <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                    <div className="flex h-[170px] items-end gap-1.5">
                      <div className="w-4 rounded-t-[4px] bg-success" style={{ height: `${incomePct}%` }} />
                      <div className="w-4 rounded-t-[4px] bg-text-faint" style={{ height: `${outflowPct}%` }} />
                    </div>
                    <div className="text-[11px] text-text-faint">{monthLabel(m.month)}</div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex gap-4 text-[11px] text-text-muted">
              <div className="flex items-center gap-[5px]">
                <div className="h-[7px] w-[7px] rounded-[2px] bg-success" />
                Income
              </div>
              <div className="flex items-center gap-[5px]">
                <div className="h-[7px] w-[7px] rounded-[2px] bg-text-faint" />
                Outflow
              </div>
            </div>
          </div>

          <div className="rounded-[14px] border border-border-subtle bg-surface px-6 py-6">
            <div className="mb-3 text-[12.5px] font-semibold uppercase tracking-[0.04em] text-text-muted">
              Net (income − outflow)
            </div>
            {netPoints ? (
              <svg width="100%" height={LINE_HEIGHT} viewBox={`0 0 ${LINE_WIDTH} ${LINE_HEIGHT}`} preserveAspectRatio="none">
                <polyline
                  points={netPoints}
                  fill="none"
                  stroke="#3B82F6"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <p className="text-[12.5px] text-text-faint">Not enough history yet.</p>
            )}
          </div>

          <div className="overflow-x-auto rounded-[14px] border border-border-subtle bg-surface">
            <div className="min-w-[420px]">
              <div className="grid grid-cols-[1fr_130px_130px_130px] border-b border-white/[0.06] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.03em] text-text-faint">
                <div>Month</div>
                <div className="text-right">Income</div>
                <div className="text-right">Outflow</div>
                <div className="text-right">Net</div>
              </div>
              {months.map((m) => (
                <div
                  key={m.month}
                  className="grid grid-cols-[1fr_130px_130px_130px] items-center border-b border-white/[0.03] px-5 py-3 text-[13px] last:border-b-0"
                >
                  <div className="text-text-secondary">{monthLabel(m.month)}</div>
                  <div className="tabular-nums text-right text-success">{formatMoney(m.income, "USD")}</div>
                  <div className="tabular-nums text-right text-danger">{formatMoney(m.outflow, "USD")}</div>
                  <div
                    className={`tabular-nums text-right font-semibold ${
                      Number(m.net) >= 0 ? "text-success" : "text-danger"
                    }`}
                  >
                    {formatMoney(m.net, "USD")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
