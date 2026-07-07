import { Global, Module } from "@nestjs/common";
import { SupabaseJwtGuard } from "./supabase-jwt.guard";

@Global()
@Module({
  providers: [SupabaseJwtGuard],
  exports: [SupabaseJwtGuard],
})
export class AuthModule {}
