import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ManualAssetDto, ManualAssetKind } from "@fin/shared";
import { useManualAssets } from "@/lib/queries";
import { api } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { useToast } from "@/providers/toast-provider";
import { Modal, ModalActions, ModalCancelButton } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import {
  ASSET_CATEGORIES,
  CATEGORY_LABELS,
  LIABILITY_CATEGORIES,
  manualAssetFormSchema,
} from "@/lib/schemas/manual-asset";

type DialogState = { key: string; kind: ManualAssetKind; item?: ManualAssetDto };

export function ManualAssetsRoute() {
  const { data, isLoading } = useManualAssets();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const currency = data?.totals.currency ?? "USD";

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/manual-assets/${id}`),
    onSuccess: () => {
      showToast("Removed.");
      setConfirmingId(null);
      queryClient.invalidateQueries({ queryKey: ["manual-assets"] });
      queryClient.invalidateQueries({ queryKey: ["net-worth"] });
    },
  });

  return (
    <div className="animate-[fadeIn_0.25s_ease]">
      <div className="mb-[22px] flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-bold tracking-[-0.01em] text-text-primary">Assets & Liabilities</h1>
          <p className="mt-[3px] text-[13px] text-text-muted">
            Off-platform net worth — real estate, vehicles, cash, crypto, and manual debts.
          </p>
        </div>
        <div className="flex shrink-0 gap-2.5">
          <button
            type="button"
            onClick={() => setDialog({ key: "new-asset", kind: "asset" })}
            className="whitespace-nowrap rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-bg hover:bg-accent-hover"
          >
            + Add asset
          </button>
          <button
            type="button"
            onClick={() => setDialog({ key: "new-liability", kind: "liability" })}
            className="whitespace-nowrap rounded-lg bg-white/[0.06] px-4 py-2.5 text-[13px] font-semibold text-text-primary hover:bg-white/10"
          >
            + Add liability
          </button>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="h-[300px] animate-pulse rounded-[14px] bg-surface" />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
            <div className="rounded-[14px] border border-border-subtle bg-surface px-5 py-[18px]">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                Manual assets
              </div>
              <div className="tabular-nums mt-1.5 text-[22px] font-bold text-success">
                {formatMoney(data.totals.assetsValue, currency)}
              </div>
            </div>
            <div className="rounded-[14px] border border-border-subtle bg-surface px-5 py-[18px]">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                Manual liabilities
              </div>
              <div className="tabular-nums mt-1.5 text-[22px] font-bold text-danger">
                {formatMoney(data.totals.liabilitiesValue, currency)}
              </div>
            </div>
          </div>

          <Section
            title="Assets"
            items={data.assets}
            emptyText="No manual assets yet."
            currency={currency}
            confirmingId={confirmingId}
            onEdit={(item) => setDialog({ key: item.id, kind: item.kind, item })}
            onConfirmDelete={setConfirmingId}
            onCancelDelete={() => setConfirmingId(null)}
            onDelete={(id) => deleteMutation.mutate(id)}
            deleting={deleteMutation.isPending ? deleteMutation.variables : undefined}
          />
          <Section
            title="Liabilities"
            items={data.liabilities}
            emptyText="No manual liabilities yet."
            currency={currency}
            confirmingId={confirmingId}
            onEdit={(item) => setDialog({ key: item.id, kind: item.kind, item })}
            onConfirmDelete={setConfirmingId}
            onCancelDelete={() => setConfirmingId(null)}
            onDelete={(id) => deleteMutation.mutate(id)}
            deleting={deleteMutation.isPending ? deleteMutation.variables : undefined}
          />
        </div>
      )}

      {dialog && (
        <ManualAssetDialog key={dialog.key} initialKind={dialog.kind} item={dialog.item} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

function Section({
  title,
  items,
  emptyText,
  currency,
  confirmingId,
  onEdit,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
  deleting,
}: {
  title: string;
  items: ManualAssetDto[];
  emptyText: string;
  currency: string;
  confirmingId: string | null;
  onEdit: (item: ManualAssetDto) => void;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;
  onDelete: (id: string) => void;
  deleting: string | undefined;
}) {
  return (
    <div>
      <h2 className="mb-2.5 text-[13px] font-semibold uppercase tracking-[0.04em] text-text-muted">{title}</h2>
      {items.length === 0 ? (
        <div className="rounded-[14px] border border-border-subtle bg-surface px-6 py-8 text-center">
          <p className="text-[13px] text-text-faint">{emptyText}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-[14px] border border-border-subtle bg-surface px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-medium text-text-primary">{item.name}</span>
                    <span className="rounded-[5px] bg-white/5 px-1.5 py-0.5 text-[10px] text-text-faint">
                      {CATEGORY_LABELS[item.category]}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-text-faint">
                    Updated {formatDate(item.updatedAt)}
                    {item.notes ? ` · ${item.notes}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="tabular-nums text-[14px] font-semibold text-text-primary">
                    {formatMoney(item.currentValue, item.currency ?? currency)}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onEdit(item)}
                      className="text-[12px] font-semibold text-text-muted hover:text-text-primary"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onConfirmDelete(item.id)}
                      className="text-[12px] font-semibold text-text-muted hover:text-danger"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>

              {confirmingId === item.id && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[9px] border border-danger/20 bg-danger/[0.08] px-3.5 py-2.5">
                  <div className="text-[12.5px] text-danger">Remove "{item.name}"? This can't be undone.</div>
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
                      disabled={deleting === item.id}
                      onClick={() => onDelete(item.id)}
                      className="rounded-[7px] bg-danger/90 px-3 py-1.5 text-[12px] font-semibold text-bg disabled:opacity-60"
                    >
                      {deleting === item.id ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ManualAssetDialog({
  initialKind,
  item,
  onClose,
}: {
  initialKind: ManualAssetKind;
  item?: ManualAssetDto;
  onClose: () => void;
}) {
  const isEdit = !!item;
  const [kind, setKind] = useState<ManualAssetKind>(item?.kind ?? initialKind);
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState(item?.category ?? (kind === "asset" ? ASSET_CATEGORIES[0] : LIABILITY_CATEGORIES[0]));
  const [currentValue, setCurrentValue] = useState(item?.currentValue ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const categories = kind === "asset" ? ASSET_CATEGORIES : LIABILITY_CATEGORIES;

  const saveMutation = useMutation({
    mutationFn: (values: { name: string; kind: ManualAssetKind; category: string; currentValue: string; notes?: string }) =>
      isEdit
        ? api.patch<ManualAssetDto>(`/manual-assets/${item.id}`, values)
        : api.post<ManualAssetDto>("/manual-assets", values),
    onSuccess: () => {
      showToast(isEdit ? "Saved." : "Added.");
      queryClient.invalidateQueries({ queryKey: ["manual-assets"] });
      queryClient.invalidateQueries({ queryKey: ["net-worth"] });
      onClose();
    },
  });

  function handleKindChange(next: ManualAssetKind) {
    setKind(next);
    const nextCategories = next === "asset" ? ASSET_CATEGORIES : LIABILITY_CATEGORIES;
    if (!nextCategories.includes(category)) setCategory(nextCategories[0]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = manualAssetFormSchema.safeParse({ name, kind, category, currentValue, notes: notes || undefined });
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
      title={isEdit ? "Edit entry" : kind === "asset" ? "Add asset" : "Add liability"}
      description="Off-platform items aren't synced from Plaid — update the value yourself when it changes."
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="flex rounded-[10px] border border-border-subtle bg-white/[0.02] p-1">
          {(["asset", "liability"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => handleKindChange(k)}
              className={`flex-1 rounded-lg py-1.5 text-[12.5px] font-semibold transition-colors ${
                kind === k ? "bg-accent text-bg" : "text-text-secondary"
              }`}
            >
              {k === "asset" ? "Asset" : "Liability"}
            </button>
          ))}
        </div>

        <FormField label="Name" error={errors.name}>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === "asset" ? "Rental house" : "Personal loan"}
          />
        </FormField>

        <FormField label="Category" error={errors.category}>
          <select
            className="input"
            value={category}
            onChange={(e) => setCategory(e.target.value as (typeof categories)[number])}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Current value" error={errors.currentValue}>
          <input
            className="input"
            inputMode="decimal"
            value={currentValue}
            onChange={(e) => setCurrentValue(e.target.value)}
            placeholder="0.00"
          />
        </FormField>

        <FormField label="Notes (optional)" error={errors.notes}>
          <textarea
            className="input min-h-[70px] resize-none"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </FormField>

        <ModalActions>
          <ModalCancelButton>Cancel</ModalCancelButton>
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-bg hover:bg-accent-hover disabled:opacity-60"
          >
            {saveMutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Add"}
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
}
