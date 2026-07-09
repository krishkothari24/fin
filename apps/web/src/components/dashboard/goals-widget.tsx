import { useGoals } from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import { EmptyRow, WidgetCard, WidgetEyebrow, WidgetSkeletonRows } from "./widget-card";

export function GoalsWidget() {
  const { data: goals, isLoading } = useGoals();
  const sorted = [...(goals ?? [])].sort((a, b) => b.progressPercent - a.progressPercent).slice(0, 5);

  return (
    <WidgetCard span2>
      <div className="mb-3.5">
        <WidgetEyebrow>Goals</WidgetEyebrow>
      </div>
      {isLoading ? (
        <WidgetSkeletonRows count={3} />
      ) : sorted.length === 0 ? (
        <EmptyRow>No goals yet.</EmptyRow>
      ) : (
        <div className="flex flex-col gap-3">
          {sorted.map((g) => {
            const pct = Math.min(Math.round(g.progressPercent), 100);
            const complete = g.progressPercent >= 100;
            return (
              <div key={g.id}>
                <div className="mb-1 flex items-baseline justify-between text-[12.5px]">
                  <span className="font-medium text-text-secondary-strong">{g.name}</span>
                  <span className="tabular-nums text-text-muted">
                    {formatMoney(g.currentAmount, g.currency)} / {formatMoney(g.targetAmount, g.currency)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                  <div className={`h-full rounded-full ${complete ? "bg-success" : "bg-accent"}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </WidgetCard>
  );
}
