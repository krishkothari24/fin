import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DashboardConfig, WidgetId } from "@fin/shared";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { useDashboardConfig, useItems } from "@/lib/queries";
import { api } from "@/lib/api";
import { useReauth } from "@/hooks/use-reauth";
import { cn } from "@/lib/utils";

const WIDGET_LABELS: Record<WidgetId, string> = {
  net_worth: "Net Worth",
  accounts: "Accounts",
  spending_by_category: "Spending by Category",
  recent_transactions: "Recent Transactions",
  cash_flow: "Cash Flow",
  holdings: "Holdings",
  liabilities: "Liabilities",
  recurring: "Recurring",
  manual_assets: "Assets & Liabilities",
  budgets: "Budgets",
  goals: "Goals",
};

type SettingsTab = "dashboard" | "connected" | "profile";

function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative h-[19px] w-[34px] shrink-0 rounded-full transition-colors",
        on ? "bg-accent/40" : "bg-white/10",
      )}
    >
      <span
        className="absolute top-0.5 h-[15px] w-[15px] rounded-full bg-text-primary transition-[left]"
        style={{ left: on ? 17 : 2 }}
      />
    </button>
  );
}

export function SettingsRoute() {
  const [tab, setTab] = useState<SettingsTab>("dashboard");

  return (
    <div className="animate-[fadeIn_0.25s_ease] flex gap-7">
      <div className="flex w-[190px] shrink-0 flex-col gap-[3px]">
        <h1 className="mb-4 text-[20px] font-bold tracking-[-0.01em] text-text-primary">Settings</h1>
        {(
          [
            ["dashboard", "Dashboard"],
            ["connected", "Connected Accounts"],
            ["profile", "Profile"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "rounded-lg px-3 py-2.5 text-left text-[13px] font-medium",
              tab === key ? "bg-accent/[0.12] text-accent" : "text-text-secondary hover:bg-white/5",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-w-0 max-w-[640px] flex-1">
        {tab === "dashboard" && <DashboardTab />}
        {tab === "connected" && <ConnectedAccountsTab />}
        {tab === "profile" && <ProfileTab />}
      </div>
    </div>
  );
}

function useConfigMutation() {
  const queryClient = useQueryClient();
  return useMutation({
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
}

function DashboardTab() {
  const { data: config } = useDashboardConfig();
  const mutation = useConfigMutation();
  const queryClient = useQueryClient();

  if (!config) {
    return <div className="h-40 animate-pulse rounded-[14px] bg-surface" />;
  }

  const sorted = config.widgets.slice().sort((a, b) => a.order - b.order);

  // Read the latest optimistic value from the cache rather than the closed-over `config` —
  // otherwise rapid consecutive toggles/reorders (each still holding the pre-click config)
  // race and silently clobber each other's changes.
  function latestConfig(): DashboardConfig {
    return queryClient.getQueryData<DashboardConfig>(["dashboard-config"]) ?? config!;
  }

  function moveWidget(id: WidgetId, direction: -1 | 1) {
    const current = latestConfig();
    const sortedNow = current.widgets.slice().sort((a, b) => a.order - b.order);
    const idx = sortedNow.findIndex((w) => w.id === id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sortedNow.length) return;
    const a = sortedNow[idx];
    const b = sortedNow[swapIdx];
    const widgets = current.widgets.map((w) => {
      if (w.id === a.id) return { ...w, order: b.order };
      if (w.id === b.id) return { ...w, order: a.order };
      return w;
    });
    mutation.mutate({ ...current, widgets });
  }

  function toggleWidget(id: WidgetId) {
    const current = latestConfig();
    const widgets = current.widgets.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w));
    mutation.mutate({ ...current, widgets });
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="rounded-[14px] border border-border-subtle bg-surface px-5 py-[18px]">
        <div className="mb-1 text-[13.5px] font-semibold text-text-primary">Widgets</div>
        <div className="mb-4 text-[12px] text-text-muted">
          Choose which cards show on your home dashboard, and in what order.
        </div>
        <div className="flex flex-col gap-2">
          {sorted.map((w, idx) => (
            <div
              key={w.id}
              className="flex items-center justify-between rounded-[9px] bg-white/[0.02] px-3 py-2.5"
            >
              <div className="text-[13px] font-medium text-text-primary">{WIDGET_LABELS[w.id]}</div>
              <div className="flex items-center gap-4">
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveWidget(w.id, -1)}
                    className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-white/5 text-[11px] text-text-secondary disabled:text-[#333A48]"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    disabled={idx === sorted.length - 1}
                    onClick={() => moveWidget(w.id, 1)}
                    className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-white/5 text-[11px] text-text-secondary disabled:text-[#333A48]"
                  >
                    ▼
                  </button>
                </div>
                <Switch on={w.enabled} onClick={() => toggleWidget(w.id)} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[14px] border border-border-subtle bg-surface px-5 py-[18px]">
        <div className="mb-4 text-[13.5px] font-semibold text-text-primary">Preferences</div>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[13px] font-medium text-text-primary">Default date range</div>
              <div className="text-[11.5px] text-text-faint">
                Used on pages that accept a date range, until you pick one.
              </div>
            </div>
            <select
              value={config.defaultRangeDays}
              onChange={(e) => mutation.mutate({ ...config, defaultRangeDays: Number(e.target.value) })}
              className="rounded-lg border border-white/10 bg-bg px-3 py-2 text-[13px] text-text-primary outline-none"
            >
              {[7, 14, 30, 60, 90].map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[13px] font-medium text-text-primary">Currency</div>
              <div className="text-[11.5px] text-text-faint">Used to format every balance and amount.</div>
            </div>
            <select
              value={config.currency}
              onChange={(e) => mutation.mutate({ ...config, currency: e.target.value })}
              className="rounded-lg border border-white/10 bg-bg px-3 py-2 text-[13px] text-text-primary outline-none"
            >
              {["USD", "EUR", "GBP", "CAD"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConnectedAccountsTab() {
  const { data: items, isLoading } = useItems();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { reauth, preparingItemId, activeItemId } = useReauth();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const refreshMutation = useMutation({
    mutationFn: (id: string) => api.post<{ refreshed: number }>(`/items/${id}/refresh`),
    onSuccess: () => {
      showToast("Refreshed — latest balances are in.");
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => api.delete<{ removed: boolean }>(`/items/${id}`),
    onSuccess: () => {
      showToast("Account disconnected.");
      setConfirmingId(null);
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[62px] animate-pulse rounded-xl bg-surface" />
        ))}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return <p className="text-[13px] text-text-muted">No connected accounts yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        const statusLabel =
          item.status === "good" ? "CONNECTED" : item.status === "login_required" ? "NEEDS ATTENTION" : "ERROR";
        const isReauthing = preparingItemId === item.id || activeItemId === item.id;
        const isRefreshing = refreshMutation.isPending && refreshMutation.variables === item.id;
        const isDisconnecting = disconnectMutation.isPending && disconnectMutation.variables === item.id;

        return (
          <div key={item.id} className="rounded-xl border border-border-subtle bg-surface px-[18px] py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-y-2.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="text-[13.5px] font-semibold text-text-primary">
                  {item.institutionName ?? "Institution"}
                </div>
                <div
                  className={cn(
                    "whitespace-nowrap rounded-md px-2 py-[3px] text-[10.5px] font-bold tracking-[0.03em]",
                    item.status === "good" ? "bg-success/[0.12] text-success" : "bg-alert/[0.14] text-alert",
                  )}
                >
                  {statusLabel}
                </div>
                <div className="whitespace-nowrap text-[11.5px] text-text-faint">
                  {item.accounts === 1 ? "1 account" : `${item.accounts} accounts`}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3.5">
                {item.status === "login_required" && (
                  <button
                    type="button"
                    disabled={isReauthing}
                    onClick={() => reauth(item.id)}
                    className="whitespace-nowrap text-[12px] font-semibold text-alert disabled:opacity-60"
                  >
                    {isReauthing ? "Preparing…" : "Reconnect"}
                  </button>
                )}
                <button
                  type="button"
                  disabled={isRefreshing}
                  onClick={() => refreshMutation.mutate(item.id)}
                  className="whitespace-nowrap text-[12px] font-semibold text-accent disabled:opacity-60"
                >
                  {isRefreshing ? "Refreshing…" : "Refresh"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingId(item.id)}
                  className="whitespace-nowrap text-[12px] font-semibold text-text-muted"
                >
                  Disconnect
                </button>
              </div>
            </div>

            {confirmingId === item.id && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[9px] border border-danger/20 bg-danger/[0.08] px-3.5 py-2.5">
                <div className="text-[12.5px] text-danger">
                  Disconnect {item.institutionName}? This removes its accounts, transactions, and history.
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingId(null)}
                    className="rounded-[7px] bg-white/[0.06] px-3 py-1.5 text-[12px] font-semibold text-text-secondary-strong"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isDisconnecting}
                    onClick={() => disconnectMutation.mutate(item.id)}
                    className="rounded-[7px] bg-danger px-3 py-1.5 text-[12px] font-semibold text-bg disabled:opacity-60"
                  >
                    {isDisconnecting ? "Disconnecting…" : "Disconnect"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProfileTab() {
  const { session, signOut } = useAuth();
  const email = session?.user.email ?? "";

  return (
    <div className="rounded-[14px] border border-border-subtle bg-surface px-6 py-[22px]">
      <div className="mb-5 flex items-center gap-3.5">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1a2233] text-[15px] font-bold text-text-secondary">
          {email ? email.slice(0, 2).toUpperCase() : "?"}
        </span>
        <div>
          <div className="text-[15px] font-semibold text-text-primary">{email || "Signed in"}</div>
          <div className="text-[12.5px] text-text-muted">Signed in</div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => signOut()}
        className="inline-block rounded-lg bg-danger/10 px-4 py-2.5 text-[13px] font-semibold text-danger"
      >
        Sign out
      </button>
    </div>
  );
}
