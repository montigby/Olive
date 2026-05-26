import {
  pgTable,
  uuid,
  text,
  date,
  timestamp,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { peopleTable } from "./people";

export const relationshipsTable = pgTable(
  "relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id").notNull(),
    fromPerson: uuid("from_person")
      .notNull()
      .references(() => peopleTable.id, { onDelete: "cascade" }),
    toPerson: uuid("to_person")
      .notNull()
      .references(() => peopleTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    check(
      "type_check",
      sql`${t.type} in ('biological_parent','adoptive_parent','step_parent','spouse','ex_spouse','partner')`,
    ),
    check("no_self_relationship", sql`${t.fromPerson} <> ${t.toPerson}`),
    unique("unique_edge").on(t.fromPerson, t.toPerson, t.type),
  ],
);

export type Relationship = typeof relationshipsTable.$inferSelect;
export type InsertRelationship = typeof relationshipsTable.$inferInsert;
