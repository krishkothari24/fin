import { z } from "zod";
import { PLAID_PRIMARY_CATEGORIES, type PlaidPrimaryCategory } from "@fin/shared";

const MONEY_REGEX = /^\d+(\.\d{1,2})?$/;

/** Categories worth budgeting against — excludes pure-inflow ones that never
 * show "spend" (spendingByCategory only counts money out). */
const NON_SPEND_CATEGORIES: PlaidPrimaryCategory[] = ["INCOME", "TRANSFER_IN"];
export const BUDGETABLE_CATEGORIES = PLAID_PRIMARY_CATEGORIES.filter(
  (c) => !NON_SPEND_CATEGORIES.includes(c),
);

export const budgetFormSchema = z.object({
  category: z.string().min(1, "Choose a category"),
  monthlyLimit: z.string().trim().regex(MONEY_REGEX, "Enter a valid amount, e.g. 500.00"),
});

export type BudgetFormValues = z.infer<typeof budgetFormSchema>;

/** "GENERAL_MERCHANDISE" -> "General Merchandise" */
export function categoryLabel(category: string): string {
  return category
    .toLowerCase()
    .split("_")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}
