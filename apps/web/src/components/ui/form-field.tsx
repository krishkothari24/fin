import type { ReactNode } from "react";

/** Shared label + input + inline-error wrapper for zod-validated forms. */
export function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-text-secondary">{label}</span>
      {children}
      {error && <span className="text-[12px] font-medium text-danger">{error}</span>}
    </label>
  );
}
