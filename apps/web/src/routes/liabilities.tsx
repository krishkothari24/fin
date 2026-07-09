import { useLiabilities } from "@/lib/queries";
import { formatDate, formatMoney } from "@/lib/format";

const KIND_LABELS: Record<string, string> = {
  credit: "Credit card",
  student: "Student loan",
  mortgage: "Mortgage",
};

export function LiabilitiesRoute() {
  const { data, isLoading } = useLiabilities();
  const liabilities = data?.liabilities ?? [];
  const currency = data?.totals.currency ?? "USD";

  return (
    <div className="animate-[fadeIn_0.25s_ease]">
      <div className="mb-[18px]">
        <h1 className="text-[20px] font-bold tracking-[-0.01em] text-text-primary">Liabilities</h1>
        <p className="mt-[3px] text-[13px] text-text-muted">Everything you owe, in one place.</p>
      </div>

      {isLoading || !data ? (
        <div className="h-[300px] animate-pulse rounded-[14px] bg-surface" />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
            <div className="rounded-[14px] border border-border-subtle bg-surface px-5 py-[18px]">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                Total debt
              </div>
              <div className="tabular-nums mt-1.5 text-[22px] font-bold text-danger">
                {formatMoney(data.totals.totalDebt, currency)}
              </div>
            </div>
            <div className="rounded-[14px] border border-border-subtle bg-surface px-5 py-[18px]">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                Minimum payment due
              </div>
              <div className="tabular-nums mt-1.5 text-[22px] font-bold text-text-primary">
                {formatMoney(data.totals.minimumPaymentDue, currency)}
              </div>
            </div>
          </div>

          {liabilities.length === 0 ? (
            <div className="rounded-[14px] border border-border-subtle bg-surface px-6 py-14 text-center">
              <p className="text-[13px] text-text-faint">No liabilities connected.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              {liabilities.map((li) => (
                <div
                  key={li.id}
                  className={`rounded-[14px] border px-6 py-5 ${
                    li.isOverdue ? "border-alert/25 bg-alert/[0.06]" : "border-border-subtle bg-surface"
                  }`}
                >
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      {li.isOverdue && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-alert" />}
                      <div>
                        <div className="text-[14px] font-semibold text-text-primary">
                          {li.accountName}{" "}
                          <span className="font-normal text-text-faint">•••• {li.mask ?? "----"}</span>
                        </div>
                        <div className="mt-0.5 text-[11.5px] text-text-muted">
                          {KIND_LABELS[li.kind] ?? li.kind}
                        </div>
                      </div>
                    </div>
                    <div className="tabular-nums text-[18px] font-bold text-text-primary">
                      {formatMoney(li.currentBalance ?? "0", li.currency ?? currency)}
                    </div>
                  </div>

                  <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4 text-[12.5px]">
                    <div>
                      <div className="text-text-faint">APR</div>
                      <div className="tabular-nums mt-0.5 font-medium text-text-secondary-strong">
                        {li.aprPercentage ? `${li.aprPercentage}%` : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-text-faint">Next payment due</div>
                      <div
                        className={`tabular-nums mt-0.5 font-medium ${
                          li.isOverdue ? "text-alert" : "text-text-secondary-strong"
                        }`}
                      >
                        {li.nextPaymentDueDate
                          ? li.isOverdue
                            ? `Overdue — was due ${formatDate(li.nextPaymentDueDate)}`
                            : formatDate(li.nextPaymentDueDate)
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-text-faint">Minimum payment</div>
                      <div className="tabular-nums mt-0.5 font-medium text-text-secondary-strong">
                        {li.minimumPaymentAmount ? formatMoney(li.minimumPaymentAmount, li.currency ?? currency) : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-text-faint">Last payment</div>
                      <div className="tabular-nums mt-0.5 font-medium text-text-secondary-strong">
                        {li.lastPaymentAmount
                          ? `${formatMoney(li.lastPaymentAmount, li.currency ?? currency)}${
                              li.lastPaymentDate ? ` · ${formatDate(li.lastPaymentDate)}` : ""
                            }`
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-text-faint">Last statement</div>
                      <div className="tabular-nums mt-0.5 font-medium text-text-secondary-strong">
                        {li.lastStatementBalance
                          ? `${formatMoney(li.lastStatementBalance, li.currency ?? currency)}${
                              li.lastStatementIssueDate ? ` · ${formatDate(li.lastStatementIssueDate)}` : ""
                            }`
                          : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
