/**
 * Live end-to-end check for the Phase 6 HTTP hardening. Boots the real app
 * (same applyHardening() as production) on an ephemeral port and asserts over
 * real HTTP:
 *   - security headers present (helmet), x-powered-by stripped, x-request-id echoed
 *   - unauthenticated + not-found responses use the sanitized error shape
 *     (statusCode/error/message/requestId, no stack leak)
 *   - the global rate limiter returns 429 once the per-IP budget is exceeded
 *   - the health check is exempt from throttling (@SkipThrottle)
 *   - every real controller requires auth (401 with no bearer token) except the
 *     explicit @Public() allow-list (health, Plaid webhook) — a regression test
 *     for the global default-deny SupabaseJwtGuard: one representative route per
 *     controller is enough, since the guard's @Public() check runs at the
 *     controller-class level and none of these controllers override it per-method
 *
 * Run: pnpm --filter @fin/api e2e:hardening   (dev-shell sandbox must be disabled)
 */
import "reflect-metadata";
// Tighten the rate-limit budget so 429 is reached quickly and deterministically.
// Set before the app boots so ConfigModule picks it up.
process.env.RATE_LIMIT_LIMIT = "8";
process.env.RATE_LIMIT_TTL = "60";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { applyHardening } from "../src/bootstrap";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  const app = await NestFactory.create(AppModule, { rawBody: true, logger: ["error", "warn"] });
  applyHardening(app);
  await app.listen(0);
  const base = (await app.getUrl()).replace("[::1]", "127.0.0.1") + "/api";

  try {
    console.log("1) security headers on GET /health…");
    const health = await fetch(`${base}/health`);
    assert(health.status === 200, `health should be 200, got ${health.status}`);
    assert(
      health.headers.get("x-content-type-options") === "nosniff",
      "helmet should set x-content-type-options: nosniff",
    );
    assert(health.headers.get("x-powered-by") === null, "x-powered-by should be stripped");
    assert(health.headers.get("x-request-id"), "x-request-id should be echoed");
    console.log("   nosniff set, x-powered-by stripped, x-request-id present ✓");

    console.log("2) unauthenticated /accounts -> sanitized 401…");
    const unauth = await fetch(`${base}/accounts`);
    assert(unauth.status === 401, `expected 401, got ${unauth.status}`);
    const unauthBody = (await unauth.json()) as Record<string, unknown>;
    assert(unauthBody.statusCode === 401, "body.statusCode should be 401");
    assert(typeof unauthBody.requestId === "string", "body should carry requestId");
    assert(!("stack" in unauthBody), "error body must not leak a stack trace");
    console.log(`   401 { statusCode, error, message, requestId } — no stack ✓`);

    console.log("2b) every non-public controller requires auth…");
    // One representative route per controller — a new controller added without
    // @UseGuards used to need an explicit annotation; now the global guard
    // default-denies unless the controller opts out with @Public().
    const guardedRoutes: Array<{ method: "GET" | "POST"; path: string }> = [
      { method: "GET", path: "/items" },
      { method: "POST", path: "/plaid/link-token" },
      { method: "GET", path: "/accounts" },
      { method: "GET", path: "/transactions" },
      { method: "GET", path: "/aggregations/net-worth" },
      { method: "GET", path: "/dashboard/config" },
      { method: "GET", path: "/investments/holdings" },
      { method: "GET", path: "/liabilities" },
      { method: "GET", path: "/recurring" },
      { method: "GET", path: "/manual-assets" },
      { method: "GET", path: "/budgets" },
      { method: "GET", path: "/goals" },
    ];
    for (const { method, path } of guardedRoutes) {
      const res = await fetch(`${base}${path}`, { method });
      assert(res.status === 401, `${method} ${path} should 401 with no token, got ${res.status}`);
      await res.arrayBuffer(); // drain
    }
    console.log(`   ${guardedRoutes.length} controllers all 401 without a token ✓`);

    console.log("2c) the @Public() allow-list stays reachable without a token…");
    const publicHealth = await fetch(`${base}/health`);
    assert(publicHealth.status === 200, `GET /health should stay public, got ${publicHealth.status}`);
    const publicWebhook = await fetch(`${base}/plaid/webhook`, { method: "POST", body: "{}" });
    assert(
      publicWebhook.status !== 401,
      `POST /plaid/webhook must not require a bearer token, got ${publicWebhook.status}`,
    );
    await publicWebhook.arrayBuffer();
    console.log("   /health and /plaid/webhook remain reachable without auth ✓");

    console.log("3) unknown route -> sanitized 404…");
    const nf = await fetch(`${base}/does-not-exist-${Date.now()}`);
    assert(nf.status === 404, `expected 404, got ${nf.status}`);
    const nfBody = (await nf.json()) as Record<string, unknown>;
    assert(nfBody.statusCode === 404 && typeof nfBody.requestId === "string", "404 shape");
    console.log("   404 sanitized shape ✓");

    console.log("4) rate limiter returns 429 past the budget (limit=8/60s)…");
    let sawTooMany = false;
    let attempts = 0;
    for (let i = 0; i < 50 && !sawTooMany; i++) {
      attempts++;
      const r = await fetch(`${base}/accounts`);
      if (r.status === 429) {
        sawTooMany = true;
        const body = (await r.json()) as Record<string, unknown>;
        assert(body.statusCode === 429, "429 body.statusCode should be 429");
      } else {
        await r.arrayBuffer(); // drain
      }
    }
    assert(sawTooMany, "expected a 429 after exceeding the rate limit");
    console.log(`   429 after ${attempts} rapid requests ✓`);

    console.log("5) health check is exempt from throttling (still 200 after 429)…");
    const healthAfter = await fetch(`${base}/health`);
    assert(healthAfter.status === 200, `health should still be 200, got ${healthAfter.status}`);
    console.log("   /health unaffected by the limiter ✓");

    console.log("\n✅ Phase 6 HTTP hardening E2E passed");
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error("\n❌ HARDENING E2E FAILED:", err);
  process.exit(1);
});
