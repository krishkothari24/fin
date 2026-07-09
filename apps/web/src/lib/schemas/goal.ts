import { z } from "zod";

const MONEY_REGEX = /^\d+(\.\d{1,2})?$/;

export const goalFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Keep it under 100 characters"),
  kind: z.enum(["savings", "debt_payoff"]),
  targetAmount: z.string().trim().regex(MONEY_REGEX, "Enter a valid amount, e.g. 5000.00"),
  targetDate: z.string().optional(),
  linkedAccountId: z.string().optional(),
  currentAmountOverride: z
    .union([z.string().trim().regex(MONEY_REGEX, "Enter a valid amount"), z.literal("")])
    .optional(),
  notes: z.string().max(1000).optional(),
});

export type GoalFormValues = z.infer<typeof goalFormSchema>;

export const GOAL_KIND_LABELS: Record<"savings" | "debt_payoff", string> = {
  savings: "Savings",
  debt_payoff: "Debt payoff",
};
