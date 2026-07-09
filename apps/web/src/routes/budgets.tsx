import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BudgetDto } from "@fin/shared";
import { useBudgets } from "@/lib/queries";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useToast } from "@/providers/toast-provider";
import { Modal, ModalActions, ModalCancelButton } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { budgetFormSchema, categoryLabel, BUDGETABLE_CATEGORIES } from "@/lib/schemas/budget";

export function BudgetsRoute() {
  const { data, isLoading } = useBudgets();
  const [dialogCategory, setDialogCategory] = useState<string | null | undefined>(undefined);
  const [confirmingCategory, setConfirmingCategory] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const budgets = data?.budgets ?? [];
  const budgetedCategories = new Set(budgets.map((b) => b.category));
  const availableCategories = BUDGETABLE_CATEGORIES.filter((c) => !budgetedCategories.has(c));

  const deleteMutation = useMutation({
    mutationFn: (category: string) => api.delete<void>(`/budgets/${category}`),
    onSuccess: () => {
      showToast("Budget removed.");
      setConfirmingCategory(null);
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
    },
  });

  return (
    <div className="animate-[fadeIn_0.25s_ease]">
      <div className="mb-[22px] flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-bold tracking-[-0.01em] text-text-primary">Budgets</h1>
          <p className="mt-[3px] text-[13px] text-text-muted">
            Monthly spend targets by category, for {data?.month ?? "this month"}.
          </p>
        </div>
        <button
          type="button"
          disabled={availableCategories.length === 0}
          onClick={() => setDialogCategory(null)}
          className="whitespace-nowrap rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-bg hover:bg-accent-hover disabled:opacity-60"
        >
          + Set a budget
        </button>
      </div>

      {isLoading || !data ? (
        <div className="h-[300px] animate-pulse rounded-[14px] bg-surface" />
      ) : budgets.length === 0 ? (
        <div className="rounded-[14px] border border-border-subtle bg-surface px-6 py-14 text-center">
          <p className="text-[13px] text-text-faint">No budgets set yet.</p>
        </div>
      ) : (
        <div className="rounded-[14px] border border-border-subtle bg-surface px-6 py-6">
          <div className="flex flex-col gap-5">
            {budgets.map((b) => (
              <BudgetRow
                key={b.category}
                budget={b}
                confirming={confirmingCategory === b.category}
                deleting={deleteMutation.isPending && deleteMutation.variables === b.category}
                onEdit={() => setDialogCategory(b.category)}
                onConfirmDelete={() => setConfirmingCategory(b.category)}
                onCancelDelete={() => setConfirmingCategory(null)}
                onDelete={() => deleteMutation.mutate(b.category)}
              />
            ))}
          </div>
        </div>
      )}

      {dialogCategory !== undefined && (
        <BudgetDialog
          key={dialogCategory ?? "new"}
          existingCategory={dialogCategory}
          availableCategories={availableCategories}
          onClose={() => setDialogCategory(undefined)}
        />
      )}
    </div>
  );
}

function BudgetRow({
  budget,
  confirming,
  deleting,
  onEdit,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
}: {
  budget: BudgetDto;
  confirming: boolean;
  deleting: boolean;
  onEdit: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const pct = Math.min(Math.round(budget.percentUsed), 100);
  const over = budget.percentUsed > 100;
  const barColor = over ? "bg-danger" : budget.percentUsed >= 80 ? "bg-alert" : "bg-accent";

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
        <span className="font-medium text-text-secondary-strong">{categoryLabel(budget.category)}</span>
        <div className="flex items-center gap-3">
          <span className="tabular-nums text-text-muted">
            <span className={`font-semibold ${over ? "text-danger" : "text-text-primary"}`}>
              {formatMoney(budget.spent, budget.currency)}
            </span>{" "}
            / {formatMoney(budget.monthlyLimit, budget.currency)}
          </span>
          <button type="button" onClick={onEdit} className="text-[12px] font-semibold text-text-muted hover:text-text-primary">
            Edit
          </button>
          <button type="button" onClick={onConfirmDelete} className="text-[12px] font-semibold text-text-muted hover:text-danger">
            Delete
          </button>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/5">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>

      {confirming && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[9px] border border-danger/20 bg-danger/[0.08] px-3.5 py-2.5">
          <div className="text-[12.5px] text-danger">Remove this budget?</div>
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

function BudgetDialog({
  existingCategory,
  availableCategories,
  onClose,
}: {
  existingCategory: string | null;
  availableCategories: readonly string[];
  onClose: () => void;
}) {
  const isEdit = !!existingCategory;
  const [category, setCategory] = useState(existingCategory ?? availableCategories[0] ?? "");
  const [monthlyLimit, setMonthlyLimit] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const saveMutation = useMutation({
    mutationFn: (values: { category: string; monthlyLimit: string }) =>
      api.put(`/budgets/${values.category}`, { monthlyLimit: values.monthlyLimit }),
    onSuccess: () => {
      showToast(isEdit ? "Budget updated." : "Budget set.");
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      onClose();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = budgetFormSchema.safeParse({ category, monthlyLimit });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    saveMutation.mutate(result.data);
  }

  return (
    <Modal
      open
      onOpenChange={(next) => !next && onClose()}
      title={isEdit ? "Edit budget" : "Set a budget"}
      description="A recurring monthly limit — compared against this month's actual spend in that category."
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <FormField label="Category" error={errors.category}>
          <select
            className="input"
            value={category}
            disabled={isEdit}
            onChange={(e) => setCategory(e.target.value)}
          >
            {(isEdit ? [existingCategory!] : availableCategories).map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Monthly limit" error={errors.monthlyLimit}>
          <input
            className="input"
            inputMode="decimal"
            value={monthlyLimit}
            onChange={(e) => setMonthlyLimit(e.target.value)}
            placeholder="0.00"
          />
        </FormField>

        <ModalActions>
          <ModalCancelButton>Cancel</ModalCancelButton>
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-bg hover:bg-accent-hover disabled:opacity-60"
          >
            {saveMutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Set budget"}
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
}
