import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { IS_PUBLIC_KEY } from "./public.decorator";

export interface AuthUser {
  id: string;
  email?: string;
}

/**
 * Verifies the Supabase-issued user JWT (ES256, signed with Supabase's asymmetric
 * JWT signing keys) against `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` on the
 * `Authorization: Bearer <token>` header and attaches `req.user`.
 *
 * Registered globally (APP_GUARD in app.module.ts) — every route requires a
 * valid JWT unless explicitly marked `@Public()`. This is deliberately
 * default-deny: a new controller that forgets an auth annotation should fail
 * closed (401), not fail open.
 */
@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  // Cached per SUPABASE_URL: createRemoteJWKSet handles its own key caching/refresh.
  private jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }
    const supabaseUrl = this.config.get<string>("SUPABASE_URL");
    if (!supabaseUrl) {
      throw new UnauthorizedException("Auth is not configured (SUPABASE_URL)");
    }
    if (!this.jwks) {
      this.jwks = createRemoteJWKSet(new URL("/auth/v1/.well-known/jwks.json", supabaseUrl));
    }
    try {
      const { payload } = await jwtVerify(header.slice(7), this.jwks);
      if (!payload.sub) throw new Error("no sub");
      req.user = { id: payload.sub, email: payload.email as string | undefined };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}
