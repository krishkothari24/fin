import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { GoalDto, GoalKind } from "@fin/shared";
import { useAccounts, useGoals } from "@/lib/queries";
import { api } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { useToast } from "@/providers/toast-provider";
import { Modal, ModalActions, ModalCancelButton } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { GOAL_KIND_LABELS, goalFormSchema } from "@/lib/schemas/goal";

export function GoalsRoute() {
  const { data: goals, isLoading } = useGoals();
  const [dialogOpen, setDialogOpen] = useState<{ key: string; goal?: GoalDto } | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/goals/${id}`),
    onSuccess: () => {
      showToast("Goal removed.");
      setConfirmingId(null);
      queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
  });

  return (
    <div className="animate-[fadeIn_0.25s_ease]">
      <div className="mb-[22px] flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-bold tracking-[-0.01em] text-text-primary">Goals</h1>
          <p className="mt-[3px] text-[13px] text-text-muted">Savings targets and debt payoff, tracked over time.</p>
        </div>
        <button
          type="button"
          onClick={() => setDialogOpen({ key: "new" })}
          className="whitespace-nowrap rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-bg hover:bg-accent-hover"
        >
          + Add goal
        </button>
      </div>

      {isLoading || !goals ? (
        <div className="h-[300px] animate-pulse rounded-[14px] bg-surface" />
      ) : goals.length === 0 ? (
        <div className="rounded-[14px] border border-border-subtle bg-surface px-6 py-14 text-center">
          <p className="text-[13px] text-text-faint">No goals yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
          {goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              confirming={confirmingId === g.id}
              deleting={deleteMutation.isPending && deleteMutation.variables === g.id}
              onEdit={() => setDialogOpen({ key: g.id, goal: g })}
              onConfirmDelete={() => setConfirmingId(g.id)}
              onCancelDelete={() => setConfirmingId(null)}
              onDelete={() => deleteMutation.mutate(g.id)}
            />
          ))}
        </div>
      )}

      {dialogOpen && (
        <GoalDialog key={dialogOpen.key} goal={dialogOpen.goal} onClose={() => setDialogOpen(null)} />
      )}
    </div>
  );
}

function GoalCard({
  goal,
  confirming,
  deleting,
  onEdit,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
}: {
  goal: GoalDto;
  confirming: boolean;
  deleting: boolean;
  onEdit: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const pct = Math.min(Math.round(goal.progressPercent), 100);
  const complete = goal.progressPercent >= 100;

  return (
    <div className="rounded-[14px] border border-border-subtle bg-surface px-5 py-[18px]">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div>
          <div className="text-[14px] font-semibold text-text-primary">{goal.name}</div>
          <div className="mt-0.5 text-[11.5px] text-text-muted">
            {GOAL_KIND_LABELS[goal.kind]}
            {goal.linkedAccountName ? ` · linked to ${goal.linkedAccountName}` : ""}
          </div>
        </div>
        <div className="flex shrink-0 gap-2.5">
          <button type="button" onClick={onEdit} className="text-[12px] font-semibold text-text-muted hover:text-text-primary">
            Edit
          </button>
          <button type="button" onClick={onConfirmDelete} className="text-[12px] font-semibold text-text-muted hover:text-danger">
            Delete
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-baseline justify-between text-[13px]">
        <span className="tabular-nums font-semibold text-text-primary">
          {formatMoney(goal.currentAmount, goal.currency)}
        </span>
        <span className="tabular-nums text-text-muted">of {formatMoney(goal.targetAmount, goal.currency)}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/5">
        <div
          className={`h-full rounded-full ${complete ? "bg-success" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 text-[11.5px] text-text-faint">
        {complete ? "Goal reached 🎉" : `${goal.progressPercent.toFixed(0)}%`}
        {goal.targetDate ? ` · target ${formatDate(goal.targetDate)}` : ""}
      </div>

      {confirming && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[9px] border border-danger/20 bg-danger/[0.08] px-3.5 py-2.5">
          <div className="text-[12.5px] text-danger">Remove "{goal.name}"?</div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onCancelDelete}
              className="rounded-[7px] bg-white/[0.06] px-3 py-1.5 text-[12px] font-semibold text-text-secondary-strong"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={onDelete}
              className="rounded-[7px] bg-danger/90 px-3 py-1.5 text-[12px] font-semibold text-bg disabled:opacity-60"
            >
              {deleting ? "Removing…" : "Remove"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function GoalDialog({ goal, onClose }: { goal?: GoalDto; onClose: () => void }) {
  const isEdit = !!goal;
  const { data: accounts } = useAccounts();
  const [name, setName] = useState(goal?.name ?? "");
  const [kind, setKind] = useState<GoalKind>(goal?.kind ?? "savings");
  const [targetAmount, setTargetAmount] = useState(goal?.targetAmount ?? "");
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? "");
  const [linkedAccountId, setLinkedAccountId] = useState(goal?.linkedAccountId ?? "");
  const [currentAmountOverride, setCurrentAmountOverride] = useState(
    goal && !goal.linkedAccountId ? goal.currentAmount : "",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const saveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      isEdit ? api.patch(`/goals/${goal.id}`, values) : api.post("/goals", values),
    onSuccess: () => {
      showToast(isEdit ? "Goal updated." : "Goal added.");
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      onClose();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = goalFormSchema.safeParse({
      name,
      kind,
      targetAmount,
      targetDate: targetDate || undefined,
      linkedAccountId: linkedAccountId || undefined,
      currentAmountOverride: linkedAccountId ? undefined : currentAmountOverride || undefined,
      notes: undefined,
    });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    saveMutation.mutate({
      ...result.data,
      // PATCH semantics: an empty string explicitly unlinks the account.
      linkedAccountId: isEdit && !linkedAccountId ? "" : result.data.linkedAccountId,
    });
  }

  return (
    <Modal open onOpenChange={(next) => !next && onClose()} title={isEdit ? "Edit goal" : "Add goal"}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <FormField label="Name" error={errors.name}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="House down payment" />
        </FormField>

        <div className="flex rounded-[10px] border border-border-subtle bg-white/[0.02] p-1">
          {(["savings", "debt_payoff"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`flex-1 rounded-lg py-1.5 text-[12.5px] font-semibold transition-colors ${
                kind === k ? "bg-accent text-bg" : "text-text-secondary"
              }`}
            >
              {GOAL_KIND_LABELS[k]}
            </button>
          ))}
        </div>

        <FormField label="Target amount" error={errors.targetAmount}>
          <input
            className="input"
            inputMode="decimal"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            placeholder="0.00"
          />
        </FormField>

        <FormField label="Target date (optional)" error={errors.targetDate}>
          <input className="input" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </FormField>

        <FormField label="Linked account (optional)" error={errors.linkedAccountId}>
          <select className="input" value={linkedAccountId} onChange={(e) => setLinkedAccountId(e.target.value)}>
            <option value="">Not linked — track manually</option>
            {(accounts ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </FormField>

        {!linkedAccountId && (
          <FormField label="Current amount" error={errors.currentAmountOverride}>
            <input
              className="input"
              inputMode="decimal"
              value={currentAmountOverride}
              onChange={(e) => setCurrentAmountOverride(e.target.value)}
              placeholder="0.00"
            />
          </FormField>
        )}

        <ModalActions>
          <ModalCancelButton>Cancel</ModalCancelButton>
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-bg hover:bg-accent-hover disabled:opacity-60"
          >
            {saveMutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Add goal"}
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
}
