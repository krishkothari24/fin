import { useNetWorth } from "@/lib/queries";
import { formatDate, formatMoney } from "@/lib/format";

function buildLinePoints(series: Array<{ netWorth: string }>, width: number, height: number, pad: number) {
  const values = series.map((p) => Number(p.netWorth));
  const min = Math.min(...values);
  const max = Math.max(...values);
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * (width - pad * 2) + pad;
      const y = height - pad - ((v - min) / (max - min || 1)) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

const CHART_WIDTH = 860;
const CHART_HEIGHT = 220;
const CHART_PAD = 16;

export function NetWorthRoute() {
  const { data, isLoading } = useNetWorth(true);

  const series = data?.series ?? [];
  const currency = data?.currency ?? "USD";
  const points = series.length >= 2 ? buildLinePoints(series, CHART_WIDTH, CHART_HEIGHT, CHART_PAD) : null;

  const assets = data ? Number(data.assets) : 0;
  const liabilities = data ? Number(data.liabilities) : 0;
  const total = assets + liabilities;
  const assetsPct = total > 0 ? Math.round((assets / total) * 100) : 50;

  return (
    <div className="animate-[fadeIn_0.25s_ease]">
      <div className="mb-[22px]">
        <h1 className="text-[20px] font-bold tracking-[-0.01em] text-text-primary">Net Worth</h1>
        <p className="mt-[3px] text-[13px] text-text-muted">Your assets and liabilities over time.</p>
      </div>

      {isLoading || !data ? (
        <div className="h-[340px] animate-pulse rounded-[14px] bg-surface" />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="rounded-[14px] border border-border-subtle bg-surface px-6 py-6">
            <div className="text-[12.5px] font-semibold uppercase tracking-[0.04em] text-text-muted">
              Net Worth as of {formatDate(data.asOf)}
            </div>
            <div className="tabular-nums mt-2 text-[32px] font-bold tracking-[-0.02em] text-text-primary">
              {formatMoney(data.netWorth, currency)}
            </div>

            {points ? (
              <svg
                width="100%"
                height={CHART_HEIGHT}
                viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                preserveAspectRatio="none"
                className="mt-5"
              >
                <polyline
                  points={points}
                  fill="none"
                  stroke="#3B82F6"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <p className="mt-5 text-[12.5px] text-text-faint">Not enough history yet for a trend line.</p>
            )}
            {series.length >= 2 && (
              <div className="mt-1 flex justify-between text-[11px] text-text-faint">
                <span>{formatDate(series[0].date)}</span>
                <span>{formatDate(series[series.length - 1].date)}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
            <div className="rounded-[14px] border border-border-subtle bg-surface px-5 py-[18px]">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-text-muted">Assets</div>
              <div className="tabular-nums mt-1.5 text-[22px] font-bold text-success">
                {formatMoney(data.assets, currency)}
              </div>
            </div>
            <div className="rounded-[14px] border border-border-subtle bg-surface px-5 py-[18px]">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                Liabilities
              </div>
              <div className="tabular-nums mt-1.5 text-[22px] font-bold text-danger">
                {formatMoney(data.liabilities, currency)}
              </div>
            </div>
          </div>

          <div className="rounded-[14px] border border-border-subtle bg-surface px-6 py-5">
            <div className="mb-3 text-[12.5px] font-semibold uppercase tracking-[0.04em] text-text-muted">
              Assets vs. Liabilities
            </div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-white/5">
              <div className="h-full bg-success" style={{ width: `${assetsPct}%` }} />
              <div className="h-full bg-danger" style={{ width: `${100 - assetsPct}%` }} />
            </div>
            <div className="mt-2.5 flex justify-between text-[11px] text-text-muted">
              <span>Assets {assetsPct}%</span>
              <span>Liabilities {100 - assetsPct}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
