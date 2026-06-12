import { defineConfig } from "drizzle-kit";

// Used only by `pnpm --filter @macronomics/db db:generate` to produce SQL migrations
// from src/schema.ts. No live connection is needed for generation.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
});
