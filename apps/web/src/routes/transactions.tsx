import { useEffect, useMemo, useState } from "react";
import { useAccounts, useSpending, useTransactions } from "@/lib/queries";
import { formatDate, signedTransactionAmount } from "@/lib/format";
import { TransactionRowDetail } from "@/components/transactions/transaction-row-detail";

const PAGE_SIZE = 25;

type PendingFilter = "all" | "pending" | "posted";
type RangeFilter = "all" | "week" | "month";

function rangeToDates(range: RangeFilter) {
  if (range === "all") return {};
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (range === "week" ? 7 : 30));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

export function TransactionsRoute() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [accountId, setAccountId] = useState("all");
  const [category, setCategory] = useState("all");
  const [pendingFilter, setPendingFilter] = useState<PendingFilter>("all");
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>("all");
  const [pageIndex, setPageIndex] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPageIndex(0);
  }, [debouncedSearch, accountId, category, pendingFilter, rangeFilter]);

  const { startDate, endDate } = useMemo(() => rangeToDates(rangeFilter), [rangeFilter]);

  const { data: accounts } = useAccounts();
  const { data: spendingCategories } = useSpending();

  const { data, isLoading } = useTransactions({
    search: debouncedSearch || undefined,
    accountId: accountId !== "all" ? accountId : undefined,
    category: category !== "all" ? category : undefined,
    pending: pendingFilter === "pending" ? true : pendingFilter === "posted" ? false : undefined,
    startDate,
    endDate,
    limit: PAGE_SIZE,
    offset: pageIndex * PAGE_SIZE,
  });

  const transactions = data?.transactions ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : pageIndex * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, (pageIndex + 1) * PAGE_SIZE);

  const accountsById = new Map((accounts ?? []).map((a) => [a.id, a]));

  return (
    <div className="animate-[fadeIn_0.25s_ease]">
      <div className="mb-[18px]">
        <h1 className="text-[20px] font-bold tracking-[-0.01em] text-text-primary">Transactions</h1>
        <p className="mt-[3px] text-[13px] text-text-muted">
          {isLoading ? "…" : `${total} transaction${total === 1 ? "" : "s"}`}
        </p>
      </div>

      <div className="mb-[18px] flex flex-wrap gap-2.5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or merchant"
          className="min-w-[200px] flex-1 rounded-lg border border-white/[0.08] bg-surface px-3 py-2.5 text-[13px] text-text-primary outline-none placeholder:text-text-faint focus:border-accent"
        />
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="rounded-lg border border-white/[0.08] bg-surface px-3 py-2.5 text-[13px] text-text-primary outline-none"
        >
          <option value="all">All accounts</option>
          {(accounts ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-white/[0.08] bg-surface px-3 py-2.5 text-[13px] text-text-primary outline-none"
        >
          <option value="all">All categories</option>
          {(spendingCategories ?? []).map((c) => (
            <option key={c.category} value={c.category}>
              {c.category}
            </option>
          ))}
        </select>
        <select
          value={pendingFilter}
          onChange={(e) => setPendingFilter(e.target.value as PendingFilter)}
          className="rounded-lg border border-white/[0.08] bg-surface px-3 py-2.5 text-[13px] text-text-primary outline-none"
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending only</option>
          <option value="posted">Posted only</option>
        </select>
        <select
          value={rangeFilter}
          onChange={(e) => setRangeFilter(e.target.value as RangeFilter)}
          className="rounded-lg border border-white/[0.08] bg-surface px-3 py-2.5 text-[13px] text-text-primary outline-none"
        >
          <option value="all">All time</option>
          <option value="week">This week</option>
          <option value="month">This month</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-[14px] border border-border-subtle bg-surface">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[90px_1fr_130px_140px_110px] border-b border-white/[0.06] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.03em] text-text-faint">
            <div>Date</div>
            <div>Description</div>
            <div>Account</div>
            <div>Category</div>
            <div className="text-right">Amount</div>
          </div>

          {isLoading ? (
            <div className="flex flex-col gap-px p-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="my-1 h-[30px] animate-pulse rounded-md bg-white/[0.03]" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-5 py-14 text-center">
              <div className="mb-3.5 h-[38px] w-[38px] rounded-[10px] bg-white/5" />
              <div className="text-[14px] font-semibold text-text-secondary-strong">
                No transactions match your filters
              </div>
              <div className="mt-1 text-[12.5px] text-text-faint">
                Try widening the date range or clearing a filter.
              </div>
            </div>
          ) : (
            transactions.map((tx) => {
              const { text, color } = signedTransactionAmount(tx.amount, tx.currency ?? "USD");
              const isExpanded = expandedId === tx.id;
              return (
                <div key={tx.id}>
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : tx.id)}
                    className={`grid cursor-pointer grid-cols-[90px_1fr_130px_140px_110px] items-center border-b border-white/[0.03] px-5 py-3.5 text-[13px] last:border-b-0 hover:bg-white/[0.02] ${
                      isExpanded ? "bg-white/[0.02]" : ""
                    }`}
                  >
                    <div className="tabular-nums text-text-muted">{formatDate(tx.date)}</div>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-text-primary">{tx.name}</div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {tx.pending && <span className="text-[10.5px] italic text-alert">Pending</span>}
                        {tx.note && <span className="text-[10.5px] text-text-faint">📝 {tx.note}</span>}
                        {tx.splits.length > 0 && (
                          <span className="text-[10.5px] text-text-faint">Split ×{tx.splits.length}</span>
                        )}
                        {tx.tags.map((t) => (
                          <span key={t} className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-text-faint">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="truncate text-text-secondary">{accountsById.get(tx.accountId)?.name ?? "—"}</div>
                    <div className="truncate text-text-secondary">{tx.category.primary ?? "Uncategorized"}</div>
                    <div className={`tabular-nums text-right font-semibold ${color}`}>{text}</div>
                  </div>
                  {isExpanded && <TransactionRowDetail tx={tx} onClose={() => setExpandedId(null)} />}
                </div>
              );
            })
          )}
        </div>
      </div>

      {!isLoading && transactions.length > 0 && (
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
    </div>
  );
}
