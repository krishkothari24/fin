import { Link } from "react-router";
import { useAccounts, useDashboardConfig } from "@/lib/queries";
import { formatMoney, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyRow, WidgetCard, WidgetEyebrow } from "./widget-card";

const MAX_TILES = 8;

export function AccountsWidget() {
  const { data: accounts, isLoading } = useAccounts();
  const { data: config } = useDashboardConfig();

  if (isLoading) {
    return (
      <>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[104px] animate-pulse rounded-[14px] bg-surface" />
        ))}
      </>
    );
  }

  const hidden = new Set(config?.hiddenAccountIds ?? []);
  const visible = (accounts ?? []).filter((a) => !hidden.has(a.id));

  if (visible.length === 0) {
    return (
      <WidgetCard>
        <div className="mb-3.5 flex items-center justify-between">
          <WidgetEyebrow>Accounts</WidgetEyebrow>
          <Link to="/accounts" className="text-[12px] font-semibold text-accent hover:text-accent-hover">
            View all
          </Link>
        </div>
        <EmptyRow>No accounts to show.</EmptyRow>
      </WidgetCard>
    );
  }

  const shown = visible.slice(0, MAX_TILES);
  const remaining = visible.length - shown.length;

  return (
    <>
      {shown.map((acc) => (
        <WidgetCard key={acc.id} className="py-4">
          <div className="flex min-w-0 items-center gap-[9px]">
            <span
              className={cn(
                "flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] text-[9.5px] font-bold text-bg",
                acc.type === "credit" || acc.type === "loan"
                  ? "bg-danger"
                  : acc.type === "investment"
                    ? "bg-accent"
                    : "bg-success",
              )}
            >
              {initials(acc.name)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[12.5px] font-semibold text-text-primary">{acc.name}</div>
              <div className="text-[10.5px] text-text-faint">•••• {acc.mask ?? "----"}</div>
            </div>
          </div>
          <div className="tabular-nums mt-3 text-[19px] font-bold tracking-[-0.01em] text-text-primary">
            {formatMoney(acc.currentBalance ?? "0", acc.currency ?? "USD")}
          </div>
        </WidgetCard>
      ))}
      {remaining > 0 && (
        <Link
          to="/accounts"
          className="flex min-h-[104px] flex-col items-center justify-center gap-1 rounded-[14px] border border-dashed border-border-subtle text-[12.5px] font-semibold text-accent hover:bg-surface"
        >
          <span>+{remaining} more</span>
          <span className="text-[11px] font-medium text-text-faint">View all accounts →</span>
        </Link>
      )}
    </>
  );
}
