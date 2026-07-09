import { z } from "zod";

const MONEY_REGEX = /^\d+(\.\d{1,2})?$/;

export const splitLineSchema = z.object({
  amount: z.string().trim().regex(MONEY_REGEX, "Enter a valid amount"),
  category: z.string().optional(),
  note: z.string().max(2000).optional(),
});

export const splitFormSchema = z.object({
  splits: z.array(splitLineSchema).min(2, "A split needs at least 2 lines"),
});

export type SplitFormValues = z.infer<typeof splitFormSchema>;
