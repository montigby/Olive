import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// pg's ConnectionParameters does `Object.assign({}, config, parse(connectionString))`,
// so an `sslmode` (etc.) query param on the connection string silently overwrites the
// explicit `ssl` option below instead of the other way around. Strip those params so
// our explicit, DB-scoped ssl config is what actually takes effect.
const connectionUrl = new URL(process.env.DATABASE_URL);
for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) {
  connectionUrl.searchParams.delete(key);
}

export const pool = new Pool({
  connectionString: connectionUrl.toString(),
  ssl: { rejectUnauthorized: false },
});
export const db = drizzle(pool, { schema });

export * from "./schema";
