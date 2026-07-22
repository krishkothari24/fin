import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/**
 * Exempts a route from the global SupabaseJwtGuard. Use only for routes that
 * have their own equivalent gate (e.g. the Plaid webhook's signature
 * verification) or that are genuinely public (health check).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
