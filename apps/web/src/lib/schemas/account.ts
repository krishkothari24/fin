import { z } from "zod";

export const accountRenameFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Keep it under 100 characters"),
});

export type AccountRenameFormValues = z.infer<typeof accountRenameFormSchema>;
