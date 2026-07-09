import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import type { AccountDto, DashboardConfig } from "@fin/shared";
import { useAccounts, useDashboardConfig, useItems } from "@/lib/queries";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { usePlaidConnect } from "@/hooks/use-plaid-connect";
import { useReauth } from "@/hooks/use-reauth";
import { cn } from "@/lib/utils";

const AGGREGATE_QUERY_KEYS = ["net-worth", "spending", "cash-flow", "liabilities", "holdings"];

export function AccountsRoute() {
  const { data: items, isLoading: itemsLoading } = useItems();
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const { data: config } = useDashboardConfig();
  const queryClient = useQueryClient();
  const { connect, starting, connecting } = usePlaidConnect();
  const { reauth, preparingItemId, activeItemId } = useReauth();
  const [collapsedItemIds, setCollapsedItemIds] = useState<Set<string>>(new Set());

  function toggleCollapsed(itemId: string) {
    setCollapsedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  const hiddenIds = new Set(config?.hiddenAccountIds ?? []);

  const toggleHiddenMutation = useMutation({
    mutationFn: ({ id, isHidden }: { id: string; isHidden: boolean }) =>
      api.patch<AccountDto>(`/accounts/${id}`, { isHidden }),
    onMutate: async ({ id, isHidden }) => {
      await queryClient.cancelQueries({ queryKey: ["accounts"] });
      const previous = queryClient.getQueryData<AccountDto[]>(["accounts"]);
      queryClient.setQueryData<AccountDto[]>(["accounts"], (old) =>
        old?.map((a) => (a.id === id ? { ...a, isHidden } : a)),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["accounts"], ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      for (const key of AGGREGATE_QUERY_KEYS) queryClient.invalidateQueries({ queryKey: [key] });
    },
  });

  const toggleDashboardHideMutation = useMutation({
    mutationFn: (nextConfig: DashboardConfig) => api.put<DashboardConfig>("/dashboard/config", nextConfig),
    onMutate: async (nextConfig) => {
      await queryClient.cancelQueries({ queryKey: ["dashboard-config"] });
      const previous = queryClient.getQueryData<DashboardConfig>(["dashboard-config"]);
      queryClient.setQueryData(["dashboard-config"], nextConfig);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["dashboard-config"], ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["dashboard-config"] }),
  });

  function toggleDashboardHide(accountId: string) {
    if (!config) return;
    const hiddenAccountIds = hiddenIds.has(accountId)
      ? config.hiddenAccountIds.filter((id) => id !== accountId)
      : [...config.hiddenAccountIds, accountId];
    toggleDashboardHideMutation.mutate({ ...config, hiddenAccountIds });
  }

  const groups = (items ?? []).map((item) => ({
    item,
    accounts: (accounts ?? []).filter((a) => a.institutionName === item.institutionName),
  }));

  const isLoading = itemsLoading || accountsLoading;

  return (
    <div className="animate-[fadeIn_0.25s_ease]">
      <div className="mb-[22px] flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-bold tracking-[-0.01em] text-text-primary">Accounts</h1>
          <p className="mt-[3px] text-[13px] text-text-muted">All connected institutions and accounts.</p>
        </div>
        <button
          type="button"
          disabled={starting || connecting}
          onClick={connect}
          className="shrink-0 whitespace-nowrap rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-bg hover:bg-accent-hover disabled:opacity-60"
        >
          {connecting ? "Connecting…" : starting ? "Preparing…" : "+ Connect another account"}
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-5">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-[160px] animate-pulse rounded-[14px] bg-surface" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <p className="text-[13px] text-text-muted">No connected accounts yet.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(({ item, accounts: grpAccounts }) => {
            const statusLabel =
              item.status === "good" ? "CONNECTED" : item.status === "login_required" ? "NEEDS ATTENTION" : "ERROR";
            const isReauthing = preparingItemId === item.id || activeItemId === item.id;
            const isCollapsed = collapsedItemIds.has(item.id);
            const groupCurrency = grpAccounts[0]?.currency ?? "USD";
            const groupTotal = grpAccounts.reduce((sum, a) => sum + Number(a.currentBalance ?? 0), 0);

            return (
              <div key={item.id} className="overflow-hidden rounded-[14px] border border-border-subtle bg-surface">
                <div className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(item.id)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-text-faint transition-transform",
                        isCollapsed && "-rotate-90",
                      )}
                    />
                    <span className="truncate text-[14px] font-semibold text-text-primary">
                      {item.institutionName ?? "Institution"}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-2 py-[3px] text-[10.5px] font-bold tracking-[0.03em]",
                        item.status === "good" ? "bg-success/[0.12] text-success" : "bg-alert/[0.14] text-alert",
                      )}
                    >
                      {statusLabel}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-3.5">
                    {grpAccounts.length > 0 && (
                      <span className="tabular-nums text-[13px] font-semibold text-text-primary">
                        {formatMoney(groupTotal, groupCurrency)}
                      </span>
                    )}
                    {item.status === "login_required" && (
                      <button
                        type="button"
                        disabled={isReauthing}
                        onClick={() => reauth(item.id)}
                        className="shrink-0 text-[12px] font-semibold text-alert hover:text-[#FBBF24] disabled:opacity-60"
                      >
                        {isReauthing ? "Preparing…" : "Reconnect →"}
                      </button>
                    )}
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="flex flex-col">
                    {grpAccounts.length === 0 ? (
                      <p className="px-5 py-4 text-[12.5px] text-text-faint">No accounts synced yet.</p>
                    ) : (
                      grpAccounts.map((acc) => {
                        const dashHidden = hiddenIds.has(acc.id);
                        return (
                          <div
                            key={acc.id}
                            className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.03] px-5 py-3.5 last:border-b-0"
                            style={{ opacity: acc.isHidden ? 0.55 : 1 }}
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[13.5px] font-medium text-text-primary">{acc.name}</span>
                                {acc.subtype && (
                                  <span className="rounded-[5px] bg-white/5 px-1.5 py-0.5 text-[10px] text-text-faint">
                                    {acc.subtype}
                                  </span>
                                )}
                                {acc.isHidden && (
                                  <span className="rounded-[5px] bg-danger/10 px-1.5 py-0.5 text-[10px] text-danger">
                                    Excluded from totals
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 text-[11.5px] text-text-faint">•••• {acc.mask ?? "----"}</div>
                            </div>
                            <div className="flex items-center gap-[18px]">
                              <div className="tabular-nums text-[14px] font-semibold text-text-primary">
                                {formatMoney(acc.currentBalance ?? "0", acc.currency ?? "USD")}
                              </div>
                              <div className="flex items-center gap-3.5">
                                <button
                                  type="button"
                                  title="Toggle dashboard card visibility"
                                  onClick={() => toggleDashboardHide(acc.id)}
                                  className={cn(
                                    "whitespace-nowrap text-[11px] font-medium",
                                    dashHidden ? "text-accent" : "text-text-faint",
                                  )}
                                >
                                  {dashHidden ? "Show on dashboard" : "Hide on dashboard"}
                                </button>
                                <button
                                  type="button"
                                  title="Toggle exclusion from totals"
                                  onClick={() => toggleHiddenMutation.mutate({ id: acc.id, isHidden: !acc.isHidden })}
                                  className={cn(
                                    "relative h-[19px] w-[34px] shrink-0 rounded-full transition-colors",
                                    acc.isHidden ? "bg-danger/35" : "bg-white/10",
                                  )}
                                >
                                  <span
                                    className="absolute top-0.5 h-[15px] w-[15px] rounded-full bg-text-primary transition-[left]"
                                    style={{ left: acc.isHidden ? 17 : 2 }}
                                  />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
