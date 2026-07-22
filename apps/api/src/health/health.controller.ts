import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { Public } from "../auth/public.decorator";

@Public()
@SkipThrottle()
@Controller("health")
export class HealthController {
  @Get()
  check() {
    return {
      status: "ok",
      service: "fin-api",
      ts: new Date().toISOString(),
    };
  }
}
