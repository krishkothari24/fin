import { Link } from "react-router";
import { useRecentTransactions } from "@/lib/queries";
import { formatDate, signedTransactionAmount } from "@/lib/format";
import { EmptyRow, WidgetCard, WidgetEyebrow, WidgetSkeletonRows } from "./widget-card";

export function RecentTransactionsWidget() {
  const { data, isLoading } = useRecentTransactions(5);
  const transactions = data?.transactions ?? [];

  return (
    <WidgetCard>
      <div className="mb-2.5 flex items-center justify-between">
        <WidgetEyebrow>Recent Transactions</WidgetEyebrow>
        <Link to="/transactions" className="text-[12px] font-semibold text-accent hover:text-accent-hover">
          View all
        </Link>
      </div>
      {isLoading ? (
        <WidgetSkeletonRows count={5} />
      ) : transactions.length === 0 ? (
        <EmptyRow>No transactions yet.</EmptyRow>
      ) : (
        <div className="flex flex-col">
          {transactions.map((tx) => {
            const { text, color } = signedTransactionAmount(tx.amount, tx.currency ?? "USD");
            return (
              <div
                key={tx.id}
                className="flex items-center justify-between gap-3 border-b border-white/[0.04] py-2 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-text-primary">{tx.name}</div>
                  <div className="text-[11px] text-text-faint">
                    {formatDate(tx.date)}
                    {tx.pending && (
                      <>
                        {" · "}
                        <span className="text-alert">Pending</span>
                      </>
                    )}
                  </div>
                </div>
                <div className={`tabular-nums shrink-0 text-[13px] font-semibold ${color}`}>{text}</div>
              </div>
            );
          })}
        </div>
      )}
    </WidgetCard>
  );
}
