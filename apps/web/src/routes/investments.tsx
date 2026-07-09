import { useState } from "react";
import { useHoldings, useInvestmentTransactions } from "@/lib/queries";
import { formatDate, formatMoney, signedTransactionAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

type Tab = "holdings" | "activity";

export function InvestmentsRoute() {
  const [tab, setTab] = useState<Tab>("holdings");
  const [pageIndex, setPageIndex] = useState(0);

  const { data: holdingsData, isLoading: holdingsLoading } = useHoldings();
  const { data: activityData, isLoading: activityLoading } = useInvestmentTransactions({
    limit: PAGE_SIZE,
    offset: pageIndex * PAGE_SIZE,
  });

  const holdings = holdingsData?.holdings ?? [];
  const totals = holdingsData?.totals;
  const currency = totals?.currency ?? "USD";
  const gainLossValue = totals ? Number(totals.gainLoss) : 0;

  const activity = activityData?.transactions ?? [];
  const total = activityData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : pageIndex * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, (pageIndex + 1) * PAGE_SIZE);

  return (
    <div className="animate-[fadeIn_0.25s_ease]">
      <div className="mb-[18px]">
        <h1 className="text-[20px] font-bold tracking-[-0.01em] text-text-primary">Investments</h1>
        <p className="mt-[3px] text-[13px] text-text-muted">Portfolio holdings and account activity.</p>
      </div>

      <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        <div className="rounded-[14px] border border-border-subtle bg-surface px-5 py-[18px]">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-text-muted">Value</div>
          <div className="tabular-nums mt-1.5 text-[22px] font-bold text-text-primary">
            {holdingsLoading || !totals ? "—" : formatMoney(totals.value, currency)}
          </div>
        </div>
        <div className="rounded-[14px] border border-border-subtle bg-surface px-5 py-[18px]">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-text-muted">Cost Basis</div>
          <div className="tabular-nums mt-1.5 text-[22px] font-bold text-text-primary">
            {holdingsLoading || !totals ? "—" : formatMoney(totals.costBasis, currency)}
          </div>
        </div>
        <div className="rounded-[14px] border border-border-subtle bg-surface px-5 py-[18px]">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-text-muted">Gain / Loss</div>
          <div
            className={cn(
              "tabular-nums mt-1.5 text-[22px] font-bold",
              holdingsLoading || !totals ? "text-text-primary" : gainLossValue >= 0 ? "text-success" : "text-danger",
            )}
          >
            {holdingsLoading || !totals ? "—" : formatMoney(totals.gainLoss, currency)}
          </div>
        </div>
      </div>

      <div className="mb-[18px] flex gap-6 border-b border-border-subtle">
        <button
          type="button"
          onClick={() => setTab("holdings")}
          className={cn(
            "border-b-2 pb-3 text-[13.5px] font-semibold",
            tab === "holdings" ? "border-accent text-text-primary" : "border-transparent text-text-muted",
          )}
        >
          Holdings
        </button>
        <button
          type="button"
          onClick={() => setTab("activity")}
          className={cn(
            "border-b-2 pb-3 text-[13.5px] font-semibold",
            tab === "activity" ? "border-accent text-text-primary" : "border-transparent text-text-muted",
          )}
        >
          Activity
        </button>
      </div>

      {tab === "holdings" ? (
        <div className="overflow-x-auto rounded-[14px] border border-border-subtle bg-surface">
          <div className="min-w-[660px]">
            <div className="grid grid-cols-[70px_1fr_80px_90px_110px_110px_110px] border-b border-white/[0.06] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.03em] text-text-faint">
              <div>Ticker</div>
              <div>Security</div>
              <div className="text-right">Qty</div>
              <div className="text-right">Price</div>
              <div className="text-right">Value</div>
              <div className="text-right">Cost Basis</div>
              <div className="text-right">Gain/Loss</div>
            </div>

            {holdingsLoading ? (
              <div className="flex flex-col gap-px p-5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="my-1 h-[30px] animate-pulse rounded-md bg-white/[0.03]" />
                ))}
              </div>
            ) : holdings.length === 0 ? (
              <p className="px-5 py-14 text-center text-[13px] text-text-faint">No holdings yet.</p>
            ) : (
              holdings.map((h) => {
                const gainLoss = h.gainLoss !== null ? Number(h.gainLoss) : null;
                const hCurrency = h.currency ?? currency;
                return (
                  <div
                    key={h.id}
                    className="grid grid-cols-[70px_1fr_80px_90px_110px_110px_110px] items-center border-b border-white/[0.03] px-5 py-3.5 text-[13px] last:border-b-0 [&>*]:min-w-0"
                  >
                    <div className="truncate font-semibold text-accent" title={h.security.tickerSymbol ?? undefined}>
                      {h.security.tickerSymbol ?? "—"}
                    </div>
                    <div className="truncate text-text-secondary-strong" title={h.security.name ?? undefined}>
                      {h.security.name ?? "—"}
                    </div>
                    <div className="tabular-nums truncate text-right text-text-secondary">{h.quantity || "—"}</div>
                    <div className="tabular-nums truncate text-right text-text-secondary">
                      {h.institutionPrice ? formatMoney(h.institutionPrice, hCurrency) : "—"}
                    </div>
                    <div className="tabular-nums truncate text-right font-semibold text-text-primary">
                      {h.value ? formatMoney(h.value, hCurrency) : "—"}
                    </div>
                    <div className="tabular-nums truncate text-right text-text-secondary">
                      {h.costBasis ? formatMoney(h.costBasis, hCurrency) : "—"}
                    </div>
                    <div
                      className={cn(
                        "tabular-nums truncate text-right font-semibold",
                        gainLoss === null ? "text-text-secondary" : gainLoss >= 0 ? "text-success" : "text-danger",
                      )}
                    >
                      {gainLoss === null
                        ? "—"
                        : `${gainLoss >= 0 ? "+" : "−"}${formatMoney(Math.abs(gainLoss), hCurrency)}`}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-[14px] border border-border-subtle bg-surface">
            <div className="min-w-[560px]">
              <div className="grid grid-cols-[90px_1fr_90px_80px_110px] border-b border-white/[0.06] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.03em] text-text-faint">
                <div>Date</div>
                <div>Description</div>
                <div>Type</div>
                <div className="text-right">Qty</div>
                <div className="text-right">Amount</div>
              </div>

              {activityLoading ? (
                <div className="flex flex-col gap-px p-5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="my-1 h-[30px] animate-pulse rounded-md bg-white/[0.03]" />
                  ))}
                </div>
              ) : activity.length === 0 ? (
                <p className="px-5 py-14 text-center text-[13px] text-text-faint">No investment activity yet.</p>
              ) : (
                activity.map((t) => {
                  const { text, color } = signedTransactionAmount(t.amount, t.currency ?? currency);
                  return (
                    <div
                      key={t.id}
                      className="grid grid-cols-[90px_1fr_90px_80px_110px] items-center border-b border-white/[0.03] px-5 py-3.5 text-[13px] last:border-b-0 [&>*]:min-w-0"
                    >
                      <div className="tabular-nums truncate text-text-muted">{formatDate(t.date)}</div>
                      <div className="truncate font-medium text-text-primary">{t.name}</div>
                      <div className="truncate text-text-secondary">
                        {t.type.charAt(0).toUpperCase() + t.type.slice(1)}
                      </div>
                      <div className="tabular-nums truncate text-right text-text-secondary">{t.quantity || "—"}</div>
                      <div className={`tabular-nums truncate text-right font-semibold ${color}`}>{text}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {!activityLoading && activity.length > 0 && (
            <div className="mt-3.5 flex items-center justify-between">
              <div className="text-[12px] text-text-faint">
                Showing {rangeStart}–{rangeEnd} of {total}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pageIndex === 0}
                  onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                  className="rounded-[7px] border border-white/[0.08] bg-surface px-[13px] py-[7px] text-[12.5px] font-semibold text-text-primary disabled:text-text-faint disabled:opacity-60"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={pageIndex >= totalPages - 1}
                  onClick={() => setPageIndex((i) => Math.min(totalPages - 1, i + 1))}
                  className="rounded-[7px] border border-white/[0.08] bg-surface px-[13px] py-[7px] text-[12.5px] font-semibold text-text-primary disabled:text-text-faint disabled:opacity-60"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
