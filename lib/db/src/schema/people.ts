import {
  pgTable,
  uuid,
  text,
  date,
  timestamp,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export const peopleTable = pgTable("people", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  birthDate: date("birth_date"),
  deathDate: date("death_date"),
  gender: text("gender"),
  managedBy: uuid("managed_by").references((): AnyPgColumn => peopleTable.id),
  // Ownership of this node by the user who claimed it (typically equals
  // the node's own id once self-claimed). A partial unique index in the
  // SQL migration enforces one node per owner.
  claimedBy: uuid("claimed_by").references((): AnyPgColumn => peopleTable.id, {
    onDelete: "set null",
  }),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  // Auto-derived (GENERATED ALWAYS ... STORED in Postgres) — lowercased,
  // trimmed concatenation of first + last name. Indexed with pg_trgm GIN
  // for fuzzy matching in the shared-invite claim flow. Read-only from
  // the application's perspective.
  nameNormalized: text("name_normalized"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Note: Person/InsertPerson types intentionally NOT exported here.
// Those names are exported from ./persons (the rich display table).
// Use `typeof peopleTable.$inferSelect` directly if you need the
// lightweight graph-node row type.
