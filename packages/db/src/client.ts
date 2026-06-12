import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "./schema.ts";

export type Schema = typeof schema;

/**
 * App-facing database type. We standardize on the postgres-js Drizzle type; the local
 * pglite handle (dev/tests) is cast to it since both speak the same Postgres dialect.
 */
export type Db = PostgresJsDatabase<Schema>;

export interface DbHandle {
  db: Db;
  migrate: () => Promise<void>;
  close: () => Promise<void>;
}

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/**
 * Create a database handle.
 * - With a connection string (prod: Supabase EU via the Supavisor pooler) → postgres-js,
 *   `prepare: false` (required for transaction-mode pooling; see ADR-0001 §6).
 * - Without one (local dev/tests) → embedded pglite (in-memory, or a path via `PGLITE_DIR`).
 *   pglite + its Drizzle adapter are devDependencies, imported lazily so prod never needs them.
 */
export async function createDb(databaseUrl = process.env.DATABASE_URL): Promise<DbHandle> {
  if (databaseUrl) {
    const postgres = (await import("postgres")).default;
    const client = postgres(databaseUrl, { prepare: false, max: 4 });
    const db = drizzlePg(client, { schema });
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    return {
      db,
      migrate: () => migrate(db, { migrationsFolder: MIGRATIONS }),
      close: () => client.end(),
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const pg = new PGlite(process.env.PGLITE_DIR);
  const local = drizzlePglite(pg, { schema });
  return {
    db: local as unknown as Db,
    migrate: () => migrate(local, { migrationsFolder: MIGRATIONS }),
    close: () => pg.close(),
  };
}
