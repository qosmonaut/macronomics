import type { Db } from "@macronomics/db";
import { initTRPC } from "@trpc/server";

/** Per-request tRPC context: the shared (process-wide) DB handle. */
export interface Context {
  db: Db;
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;
