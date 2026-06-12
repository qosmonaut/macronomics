/**
 * Macronomics API server: Hono hosting tRPC at /trpc/v1.
 *
 *   node services/api/src/index.ts          # uses DATABASE_URL (Supabase) or local pglite
 *
 * One DB handle is created per process and shared via tRPC context. Migrations are applied
 * on startup (idempotent). A minimal in-memory rate limiter guards the public free-tier API.
 */
import { serve } from "@hono/node-server";
import { createDb } from "@macronomics/db";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { Hono } from "hono";

import { appRouter } from "./router.ts";

const PORT = Number(process.env.PORT ?? 8787);
const TRPC_ENDPOINT = "/trpc/v1";

const handle = await createDb();
await handle.migrate(); // ensure schema exists (idempotent; safe against Supabase + pglite)

const app = new Hono();

// Fixed-window in-memory rate limiter per client IP (ADR-0001 §7). Good enough for a single
// instance; replace with a shared store if we scale horizontally.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120;
const hits = new Map<string, { count: number; resetAt: number }>();
app.use("*", async (c, next) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else if (++entry.count > MAX_PER_WINDOW) {
    return c.json({ error: "rate_limited" }, 429);
  }
  await next();
});

app.get("/health", (c) => c.json({ ok: true }));

app.all(`${TRPC_ENDPOINT}/*`, (c) =>
  fetchRequestHandler({
    endpoint: TRPC_ENDPOINT,
    req: c.req.raw,
    router: appRouter,
    createContext: () => ({ db: handle.db }),
  }),
);

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`macronomics-api on http://localhost:${info.port} (tRPC: ${TRPC_ENDPOINT})`);
});
