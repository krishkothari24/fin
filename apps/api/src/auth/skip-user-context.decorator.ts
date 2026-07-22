import { SetMetadata } from "@nestjs/common";

export const SKIP_USER_CONTEXT_KEY = "skipUserContext";

/**
 * Exempts a controller/route from `UserContextInterceptor`'s per-request
 * `withUserContext` wrapping. Use only for routes whose service layer calls an
 * external API (Plaid) interleaved with DB writes — holding one Postgres
 * transaction open across that network I/O caused real deadlocks under this
 * app's own concurrent-access patterns (see QueueService's equivalent note for
 * background jobs). Those services use PrismaOwnerService instead, so RLS
 * simply doesn't apply to them; they're already correctly `userId`-scoped in
 * application code (verified — see docs/SECURITY.md).
 */
export const SkipUserContext = () => SetMetadata(SKIP_USER_CONTEXT_KEY, true);
