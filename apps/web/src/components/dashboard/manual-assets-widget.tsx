import { useManualAssets } from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/schemas/manual-asset";
import { EmptyRow, WidgetCard, WidgetEyebrow, WidgetSkeletonRows } from "./widget-card";

export function ManualAssetsWidget() {
  const { data, isLoading } = useManualAssets();
  const currency = data?.totals.currency ?? "USD";
  const items = [...(data?.assets ?? []), ...(data?.liabilities ?? [])]
    .sort((a, b) => Number(b.currentValue) - Number(a.currentValue))
    .slice(0, 5);

  return (
    <WidgetCard span2>
      <div className="mb-3.5 flex items-center justify-between">
        <WidgetEyebrow>Assets & Liabilities</WidgetEyebrow>
        {data && (
          <div className="flex gap-5 text-[12px] text-text-muted">
            <span>
              Assets <b className="tabular-nums text-success">{formatMoney(data.totals.assetsValue, currency)}</b>
            </span>
            <span>
              Liabilities <b className="tabular-nums text-danger">{formatMoney(data.totals.liabilitiesValue, currency)}</b>
            </span>
          </div>
        )}
      </div>
      {isLoading ? (
        <WidgetSkeletonRows count={3} />
      ) : items.length === 0 ? (
        <EmptyRow>No manual assets or liabilities yet.</EmptyRow>
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-[9px] px-3 py-2.5">
              <div>
                <div className="text-[13px] font-medium text-text-primary">{item.name}</div>
                <div className="mt-0.5 text-[11px] text-text-faint">{CATEGORY_LABELS[item.category]}</div>
              </div>
              <div
                className={`tabular-nums shrink-0 text-[13px] font-semibold ${
                  item.kind === "liability" ? "text-danger" : "text-text-primary"
                }`}
              >
                {formatMoney(item.currentValue, item.currency ?? currency)}
              </div>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}
