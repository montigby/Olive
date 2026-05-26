/**
 * One-time migration script: creates the people + relationships tables.
 * Run via: DATABASE_URL=<url> node scripts/run-migration-0007.mjs
 *
 * This is called from the API server's /api/admin/migrate-0007 endpoint
 * which injects DATABASE_URL from the Vercel environment.
 */
import pg from "pg";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const { Pool } = pg;

const SQL = `
create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  first_name text not null,
  last_name text,
  birth_date date,
  death_date date,
  gender text,
  managed_by uuid references people(id),
  created_at timestamptz default now()
);

create index if not exists people_family_id_idx on people (family_id);

create table if not exists relationships (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  from_person uuid not null references people(id) on delete cascade,
  to_person   uuid not null references people(id) on delete cascade,
  type text not null check (type in (
    'biological_parent',
    'adoptive_parent',
    'step_parent',
    'spouse',
    'ex_spouse',
    'partner'
  )),
  start_date date,
  end_date date,
  created_at timestamptz default now(),
  constraint no_self_relationship check (from_person <> to_person),
  constraint unique_edge unique (from_person, to_person, type)
);

create index if not exists relationships_from_idx on relationships (from_person, type);
create index if not exists relationships_to_idx on relationships (to_person, type);
create index if not exists relationships_family_idx on relationships (family_id);
`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    console.log("Running migration 0007...");
    await client.query(SQL);
    console.log("Migration 0007 complete.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
