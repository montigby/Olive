import { pgTable, uuid, text, jsonb, timestamp, varchar } from "drizzle-orm/pg-core";
import { familyUnitsTable } from "./familyUnits";
import { personsTable } from "./persons";

export const memoriesTable = pgTable("memories", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: uuid("person_id")
    .notNull()
    .references(() => personsTable.id, { onDelete: "cascade" }),
  familyUnitId: uuid("family_unit_id")
    .notNull()
    .references(() => familyUnitsTable.id, { onDelete: "cascade" }),
  contributorPersonId: uuid("contributor_person_id").references(() => personsTable.id, {
    onDelete: "set null",
  }),
  body: text("body").notNull(),
  photoUrls: jsonb("photo_urls").$type<string[]>().notNull().default([]),
  promptText: text("prompt_text"),
  // Set only for memories created via the reply-to-email ingestion path
  // (routes/webhooks.ts) -- Resend's own inbound email id. A plain unique
  // constraint on a nullable column allows unlimited NULLs (every
  // app/AI-chat-submitted memory) while still rejecting a second insert for
  // the same inbound email, which is how a duplicate/retried webhook
  // delivery from Resend gets deduplicated without extra bookkeeping.
  sourceEmailId: varchar("source_email_id", { length: 255 }).unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Memory = typeof memoriesTable.$inferSelect;
export type InsertMemory = typeof memoriesTable.$inferInsert;
