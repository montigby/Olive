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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Note: Person/InsertPerson types intentionally NOT exported here.
// Those names are exported from ./persons (the rich display table).
// Use `typeof peopleTable.$inferSelect` directly if you need the
// lightweight graph-node row type.
