/**
 * Mint a pre-confirmed Supabase Auth user for local dev/testing, bypassing the
 * sign-up form's email confirmation flow (see CLAUDE.md Gotcha 9).
 *
 * Run: pnpm --filter @fin/api exec ts-node scripts/create-test-user.ts [email] [password]
 */
import { readFileSync } from "fs";
import { join } from "path";

function loadEnv(): Record<string, string> {
  const path = join(__dirname, "..", ".env");
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const supabaseUrl = env.SUPABASE_URL;
  const secretKey = env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) throw new Error("SUPABASE_URL / SUPABASE_SECRET_KEY missing from apps/api/.env");

  const email = process.argv[2] || `test-${Date.now()}@fin-dev.test`;
  const password = process.argv[3] || "TestPassword123!";

  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });

  const body: any = await res.json();
  if (!res.ok) throw new Error(`Admin create failed (${res.status}): ${JSON.stringify(body)}`);

  console.log("Test user created and pre-confirmed:");
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  console.log(`  user id:  ${body.id}`);
  console.log("\nSign in with these at http://localhost:5173 — no email confirmation needed.");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
