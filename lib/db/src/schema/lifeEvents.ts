import { pgTable, uuid, text, date, timestamp } from "drizzle-orm/pg-core";
import { familyUnitsTable } from "./familyUnits";
import { personsTable } from "./persons";

export const lifeEventsTable = pgTable("life_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id")
    .notNull()
    .references(() => familyUnitsTable.id, { onDelete: "cascade" }),
  personId: uuid("person_id")
    .notNull()
    .references(() => personsTable.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  eventDate: date("event_date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by").references(() => personsTable.id, {
    onDelete: "set null",
  }),
});

export type LifeEvent = typeof lifeEventsTable.$inferSelect;
export type InsertLifeEvent = typeof lifeEventsTable.$inferInsert;
