import { useLiabilities } from "@/lib/queries";
import { formatDate, formatMoney } from "@/lib/format";
import { EmptyRow, WidgetCard, WidgetEyebrow, WidgetSkeletonRows } from "./widget-card";

export function LiabilitiesWidget() {
  const { data, isLoading } = useLiabilities();
  const liabilities = data?.liabilities ?? [];
  const currency = data?.totals.currency ?? "USD";

  return (
    <WidgetCard span2>
      <div className="mb-3.5 flex items-center justify-between">
        <WidgetEyebrow>Liabilities</WidgetEyebrow>
        {data && (
          <div className="flex gap-5 text-[12px] text-text-muted">
            <span>
              Total debt{" "}
              <b className="tabular-nums text-text-primary">{formatMoney(data.totals.totalDebt, currency)}</b>
            </span>
            <span>
              Min. due{" "}
              <b className="tabular-nums text-text-primary">
                {formatMoney(data.totals.minimumPaymentDue, currency)}
              </b>
            </span>
          </div>
        )}
      </div>
      {isLoading ? (
        <WidgetSkeletonRows count={2} />
      ) : liabilities.length === 0 ? (
        <EmptyRow>No liabilities connected.</EmptyRow>
      ) : (
        <div className="flex flex-col gap-2.5">
          {liabilities.map((li) => (
            <div
              key={li.id}
              className={`flex items-center justify-between rounded-[9px] px-3 py-2.5 ${
                li.isOverdue ? "bg-alert/[0.07]" : ""
              }`}
            >
              <div className="flex items-center gap-2.5">
                {li.isOverdue && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-alert" />}
                <div>
                  <div className="text-[13px] font-medium text-text-primary">
                    {li.accountName} <span className="font-normal text-text-faint">•••• {li.mask ?? "----"}</span>
                  </div>
                  <div className={`mt-0.5 text-[11px] ${li.isOverdue ? "text-alert" : "text-text-faint"}`}>
                    {li.nextPaymentDueDate
                      ? li.isOverdue
                        ? `Overdue — was due ${formatDate(li.nextPaymentDueDate)}`
                        : `Due ${formatDate(li.nextPaymentDueDate)}`
                      : "No due date on file"}
                  </div>
                </div>
              </div>
              <div className="tabular-nums shrink-0 text-[13px] font-semibold text-text-primary">
                {formatMoney(li.currentBalance ?? "0", li.currency ?? currency)}
              </div>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}
