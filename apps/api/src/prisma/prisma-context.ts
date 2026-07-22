import { AsyncLocalStorage } from "async_hooks";
import { Prisma } from "@prisma/client";

/**
 * The active per-request/per-job transaction, set by `PrismaService.withUserContext`.
 * `PrismaService`'s model-delegate getters and raw-query overrides check this at
 * call time so every existing `this.prisma.x.y(...)` call site keeps working
 * unchanged, transparently running against this transaction (with
 * `app.user_id` set for the duration) whenever one is open.
 */
export const prismaTxContext = new AsyncLocalStorage<Prisma.TransactionClient>();
