import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function WidgetCard({
  span2,
  className,
  children,
}: {
  span2?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[14px] border border-border-subtle bg-surface px-[22px] py-5",
        span2 && "[grid-column:span_2]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function WidgetEyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="text-[12.5px] font-semibold uppercase tracking-[0.04em] text-text-muted">
      {children}
    </span>
  );
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="py-2 text-[12.5px] text-text-faint">{children}</p>;
}

export function WidgetSkeletonRows({ count }: { count: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-[30px] animate-pulse rounded-md bg-white/[0.03]" />
      ))}
    </div>
  );
}
