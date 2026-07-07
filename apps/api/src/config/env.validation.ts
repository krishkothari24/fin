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

  // --- Phase 6: hardening / prod readiness ---
  // Error monitoring. Unset -> Sentry stays off (no-op); set it in prod.
  SENTRY_DSN: z.string().url().optional(),
  // Comma-separated browser origins allowed to call the API (the future web app).
  // Unset -> CORS disabled (server-to-server only). e.g. "https://app.example.com".
  CORS_ORIGINS: z.string().optional(),
  // Rate limiting (in-memory, per-instance). TTL is the window in seconds; the
  // limit is the global per-IP budget. Plaid-triggering endpoints (link-token /
  // exchange) carry their own tighter fixed cap via @Throttle in the controller.
  RATE_LIMIT_TTL: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_LIMIT: z.coerce.number().int().positive().default(120),
  // Behind a proxy/load balancer (Render, etc.) trust N hops so client IPs
  // (used for rate-limit keys) are the real caller, not the proxy.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  // Structured logs as JSON (prod) vs. pretty single lines (dev). Unset -> follow
  // NODE_ENV. (transform before optional so an absent value stays undefined.)
  LOG_JSON: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
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
