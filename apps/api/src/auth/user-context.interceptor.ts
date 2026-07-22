import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { firstValueFrom, from, Observable } from "rxjs";
import { PrismaService } from "../prisma/prisma.service";
import { SKIP_USER_CONTEXT_KEY } from "./skip-user-context.decorator";
import { AuthUser } from "./supabase-jwt.guard";

/**
 * Runs after SupabaseJwtGuard (interceptors always run after guards), so
 * `req.user` is set for every guarded route. Wraps the rest of the request —
 * the controller, every service call beneath it — in
 * `PrismaService.withUserContext(userId, ...)`, which is what the Phase 13
 * `FORCE ROW LEVEL SECURITY` policies key off. Public routes (health, the
 * Plaid webhook) have no `req.user` and pass through unscoped, which is
 * correct: the webhook doesn't know a user yet (see PrismaOwnerService), and
 * health makes no DB calls at all. Routes marked `@SkipUserContext()` (the
 * item lifecycle / Plaid Link controllers) also pass through unwrapped — see
 * that decorator for why.
 */
@Injectable()
export class UserContextInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_USER_CONTEXT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    const req = context.switchToHttp().getRequest();
    const user: AuthUser | undefined = req.user;
    if (!user?.id) return next.handle();

    return from(this.prisma.withUserContext(user.id, () => firstValueFrom(next.handle())));
  }
}
