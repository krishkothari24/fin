import * as RadixDialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

/**
 * Shared "Add/Edit X" dialog shell, styled to match the app's existing cards.
 * Wraps @radix-ui/react-dialog for focus trapping / escape-to-close / a11y.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/60 [animation:fadeIn_0.15s_ease]" />
        <RadixDialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-[14px] border border-border-subtle bg-surface p-6 shadow-2xl [animation:fadeIn_0.15s_ease] focus:outline-none"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <RadixDialog.Title className="text-[16px] font-bold tracking-[-0.01em] text-text-primary">
                {title}
              </RadixDialog.Title>
              {description && (
                <RadixDialog.Description className="mt-1 text-[13px] text-text-muted">
                  {description}
                </RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close
              aria-label="Close"
              className="shrink-0 rounded-md p-1 text-text-faint transition-colors hover:text-text-primary"
            >
              ✕
            </RadixDialog.Close>
          </div>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function ModalActions({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex items-center justify-end gap-3">{children}</div>;
}

export function ModalCancelButton({ children }: { children: ReactNode }) {
  return (
    <RadixDialog.Close
      type="button"
      className="rounded-lg px-4 py-2.5 text-[13px] font-semibold text-text-secondary hover:text-text-primary"
    >
      {children}
    </RadixDialog.Close>
  );
}
