import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "../config.js";
import * as schema from "./schema.js";

import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Database;
  close: () => Promise<void>;
  driver: "postgres" | "pglite";
}

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");

/**
 * Con DATABASE_URL se conecta a Postgres. Sin ella usa PGlite (Postgres compilado a WebAssembly),
 * así el desarrollo local no necesita instalar nada. `memory` sirve para las pruebas.
 */
export async function connectDb(cfg: Config, opts: { memory?: boolean } = {}): Promise<DbHandle> {
  if (cfg.DATABASE_URL && !opts.memory) {
    const { default: pg } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    // En Vercel cada instancia atiende pocas peticiones a la vez: no hacen falta muchas conexiones.
    const pool = new pg.Pool({ connectionString: cfg.DATABASE_URL, max: cfg.isVercel ? 3 : 10 });
    const db = drizzle(pool, { schema });
    if (cfg.MIGRATE_ON_START) await migrate(db, { migrationsFolder });
    return { db: db as unknown as Database, close: () => pool.end(), driver: "postgres" };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  let client;
  if (opts.memory) {
    client = new PGlite();
  } else {
    const dir = path.resolve(cfg.DATA_DIR, "db");
    mkdirSync(dir, { recursive: true });
    client = new PGlite(dir);
  }
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return { db: db as unknown as Database, close: () => client.close(), driver: "pglite" };
}
