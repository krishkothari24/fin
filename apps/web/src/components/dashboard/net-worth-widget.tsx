import { Link } from "react-router";
import { useNetWorth } from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import { WidgetCard, WidgetEyebrow } from "./widget-card";

export function NetWorthWidget() {
  const { data, isLoading } = useNetWorth();

  if (isLoading || !data) {
    return (
      <WidgetCard>
        <div className="h-[90px] animate-pulse rounded-lg bg-white/[0.03]" />
      </WidgetCard>
    );
  }

  return (
    <WidgetCard>
      <div className="flex items-center justify-between">
        <WidgetEyebrow>Net Worth</WidgetEyebrow>
        <Link to="/net-worth" className="text-[12px] font-semibold text-accent hover:text-accent-hover">
          View trend
        </Link>
      </div>
      <div className="tabular-nums mt-2 text-[26px] font-bold tracking-[-0.02em] text-text-primary">
        {formatMoney(data.netWorth, data.currency)}
      </div>
      <div className="mt-3 flex gap-[18px]">
        <div>
          <div className="text-[11px] text-text-faint">Assets</div>
          <div className="tabular-nums text-[13px] font-semibold text-success">
            {formatMoney(data.assets, data.currency)}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-text-faint">Liabilities</div>
          <div className="tabular-nums text-[13px] font-semibold text-danger">
            {formatMoney(data.liabilities, data.currency)}
          </div>
        </div>
      </div>
    </WidgetCard>
  );
}
