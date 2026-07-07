import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { jwtVerify } from "jose";

export interface AuthUser {
  id: string;
  email?: string;
}

/**
 * Verifies the Supabase-issued user JWT (HS256, signed with SUPABASE_JWT_SECRET)
 * on the `Authorization: Bearer <token>` header and attaches `req.user`.
 * Apply on any controller that touches user-scoped data.
 */
@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }
    const secret = this.config.get<string>("SUPABASE_JWT_SECRET");
    if (!secret) {
      throw new UnauthorizedException("Auth is not configured (SUPABASE_JWT_SECRET)");
    }
    try {
      const { payload } = await jwtVerify(
        header.slice(7),
        new TextEncoder().encode(secret),
      );
      if (!payload.sub) throw new Error("no sub");
      req.user = { id: payload.sub, email: payload.email as string | undefined };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}
