import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PLAID_PRIMARY_CATEGORIES } from "@fin/shared";
import type { TransactionDto } from "@fin/shared";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useToast } from "@/providers/toast-provider";
import { Modal, ModalActions, ModalCancelButton } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { splitFormSchema } from "@/lib/schemas/split";
import { categoryLabel } from "@/lib/schemas/budget";

function invalidateTransactionQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["transactions"] });
  queryClient.invalidateQueries({ queryKey: ["spending"] });
}

/** Inline edit panel rendered below a transaction row: note, tags, category override, split entry point. */
export function TransactionRowDetail({ tx, onClose }: { tx: TransactionDto; onClose: () => void }) {
  const [note, setNote] = useState(tx.note ?? "");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(tx.tags);
  const [categoryOverride, setCategoryOverride] = useState(tx.category.primary ?? "");
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch(`/transactions/${tx.id}`, {
        note: note || null,
        categoryOverride: categoryOverride || null,
        tags,
      }),
    onSuccess: () => {
      showToast("Saved.");
      invalidateTransactionQueries(queryClient);
      onClose();
    },
  });

  function addTag() {
    const value = tagInput.trim();
    if (value && !tags.includes(value)) setTags([...tags, value]);
    setTagInput("");
  }

  return (
    <div className="border-b border-white/[0.03] bg-white/[0.015] px-5 py-4 last:border-b-0">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Note">
          <textarea
            className="input min-h-[60px] resize-none"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note…"
          />
        </FormField>

        <FormField label="Category">
          <select className="input" value={categoryOverride} onChange={(e) => setCategoryOverride(e.target.value)}>
            <option value="">Uncategorized</option>
            {PLAID_PRIMARY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <div className="mt-4">
        <span className="text-[13px] font-medium text-text-secondary">Tags</span>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11.5px] font-medium text-text-secondary-strong"
            >
              {t}
              <button
                type="button"
                onClick={() => setTags(tags.filter((x) => x !== t))}
                className="text-text-faint hover:text-danger"
              >
                ✕
              </button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag();
              }
            }}
            onBlur={addTag}
            placeholder="Add a tag, Enter to confirm"
            className="input w-[180px] py-1.5"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.05] pt-4">
        <button
          type="button"
          onClick={() => setSplitDialogOpen(true)}
          className="text-[12.5px] font-semibold text-accent hover:text-accent-hover"
        >
          {tx.splits.length > 0 ? `Edit split (${tx.splits.length} lines) →` : "Split transaction →"}
        </button>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-text-secondary hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            className="rounded-lg bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-bg hover:bg-accent-hover disabled:opacity-60"
          >
            {saveMutation.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {splitDialogOpen && <SplitDialog tx={tx} onClose={() => setSplitDialogOpen(false)} />}
    </div>
  );
}

function SplitDialog({ tx, onClose }: { tx: TransactionDto; onClose: () => void }) {
  const [lines, setLines] = useState(
    tx.splits.length > 0
      ? tx.splits.map((s) => ({ amount: s.amount, category: s.category ?? "", note: s.note ?? "" }))
      : [
          { amount: "", category: "", note: "" },
          { amount: "", category: "", note: "" },
        ],
  );
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const currency = tx.currency ?? "USD";

  const remaining = Number(
    (Number(tx.amount) - lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)).toFixed(2),
  );

  const setSplitsMutation = useMutation({
    mutationFn: () =>
      api.put(`/transactions/${tx.id}/splits`, {
        splits: lines.map((l) => ({
          amount: l.amount,
          category: l.category || undefined,
          note: l.note || undefined,
        })),
      }),
    onSuccess: () => {
      showToast("Split saved.");
      invalidateTransactionQueries(queryClient);
      onClose();
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : "Couldn't save the split."),
  });

  const clearSplitsMutation = useMutation({
    mutationFn: () => api.delete(`/transactions/${tx.id}/splits`),
    onSuccess: () => {
      showToast("Split cleared.");
      invalidateTransactionQueries(queryClient);
      onClose();
    },
  });

  function updateLine(i: number, patch: Partial<(typeof lines)[number]>) {
    setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = splitFormSchema.safeParse({ splits: lines });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Invalid split.");
      return;
    }
    if (remaining !== 0) {
      setError(`Amounts must sum to ${formatMoney(tx.amount, currency)} (${remaining > 0 ? "under" : "over"} by ${formatMoney(Math.abs(remaining), currency)}).`);
      return;
    }
    setError(null);
    setSplitsMutation.mutate();
  }

  return (
    <Modal
      open
      onOpenChange={(next) => !next && onClose()}
      title="Split transaction"
      description={`${tx.name} — ${formatMoney(tx.amount, currency)} total`}
    >
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        {lines.map((line, i) => (
          <div key={i} className="flex items-start gap-2">
            <input
              className="input w-[100px]"
              inputMode="decimal"
              placeholder="0.00"
              value={line.amount}
              onChange={(e) => updateLine(i, { amount: e.target.value })}
            />
            <select
              className="input flex-1"
              value={line.category}
              onChange={(e) => updateLine(i, { category: e.target.value })}
            >
              <option value="">Uncategorized</option>
              {PLAID_PRIMARY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </select>
            {lines.length > 2 && (
              <button
                type="button"
                onClick={() => setLines(lines.filter((_, idx) => idx !== i))}
                className="mt-2.5 text-text-faint hover:text-danger"
                aria-label="Remove line"
              >
                ✕
              </button>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={() => setLines([...lines, { amount: "", category: "", note: "" }])}
          className="self-start text-[12.5px] font-semibold text-accent hover:text-accent-hover"
        >
          + Add line
        </button>

        <div className={`text-[12.5px] font-medium ${remaining === 0 ? "text-success" : "text-text-muted"}`}>
          {remaining === 0
            ? "Fully allocated ✓"
            : `${formatMoney(Math.abs(remaining), currency)} ${remaining > 0 ? "left to allocate" : "over"}`}
        </div>

        {error && <p className="text-[12px] font-medium text-danger">{error}</p>}

        <ModalActions>
          {tx.splits.length > 0 && (
            <button
              type="button"
              disabled={clearSplitsMutation.isPending}
              onClick={() => clearSplitsMutation.mutate()}
              className="mr-auto text-[12.5px] font-semibold text-danger hover:text-danger/80 disabled:opacity-60"
            >
              {clearSplitsMutation.isPending ? "Clearing…" : "Clear split"}
            </button>
          )}
          <ModalCancelButton>Cancel</ModalCancelButton>
          <button
            type="submit"
            disabled={setSplitsMutation.isPending || remaining !== 0}
            className="rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-bg hover:bg-accent-hover disabled:opacity-60"
          >
            {setSplitsMutation.isPending ? "Saving…" : "Save split"}
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
}
