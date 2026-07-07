import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { AuthUser } from "./supabase-jwt.guard";

/** Injects the authenticated user set by SupabaseJwtGuard: `@CurrentUser() user`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    return ctx.switchToHttp().getRequest().user;
  },
);
