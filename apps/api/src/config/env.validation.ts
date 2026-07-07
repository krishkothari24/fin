import { z } from "zod";

/**
 * Environment schema. Secrets are optional so the app boots for local dev /
 * health checks without them; the services that actually need a secret throw a
 * clear error if it's missing when used.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),

  DATABASE_URL: z.string().optional(),
  DIRECT_URL: z.string().optional(),

  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_JWT_SECRET: z.string().optional(),

  PLAID_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  PLAID_CLIENT_ID: z.string().optional(),
  PLAID_SECRET: z.string().optional(),
  PLAID_WEBHOOK_URL: z.string().url().optional(),

  ENCRYPTION_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/** @nestjs/config `validate` hook. Blank env vars ("") are treated as unset. */
export function validateEnv(config: Record<string, unknown>): Env {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    cleaned[key] = value === "" ? undefined : value;
  }
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${details}`);
  }
  return parsed.data;
}
