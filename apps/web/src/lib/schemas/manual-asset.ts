import { z } from "zod";
import type { ManualAssetCategory, ManualAssetKind } from "@fin/shared";

const MONEY_REGEX = /^\d+(\.\d{1,2})?$/;

export const ASSET_CATEGORIES: ManualAssetCategory[] = [
  "real_estate",
  "vehicle",
  "cash",
  "crypto",
  "other_asset",
];
export const LIABILITY_CATEGORIES: ManualAssetCategory[] = ["loan", "credit_debt", "other_liability"];

export const CATEGORY_LABELS: Record<ManualAssetCategory, string> = {
  real_estate: "Real estate",
  vehicle: "Vehicle",
  cash: "Cash",
  crypto: "Crypto",
  other_asset: "Other asset",
  loan: "Loan",
  credit_debt: "Credit / debt",
  other_liability: "Other liability",
};

export const manualAssetFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Keep it under 100 characters"),
  kind: z.enum(["asset", "liability"] as [ManualAssetKind, ManualAssetKind]),
  category: z.enum([...ASSET_CATEGORIES, ...LIABILITY_CATEGORIES] as [
    ManualAssetCategory,
    ...ManualAssetCategory[],
  ]),
  currentValue: z
    .string()
    .trim()
    .regex(MONEY_REGEX, "Enter a valid amount, e.g. 1200.50"),
  notes: z.string().max(1000, "Keep it under 1000 characters").optional(),
});

export type ManualAssetFormValues = z.infer<typeof manualAssetFormSchema>;
