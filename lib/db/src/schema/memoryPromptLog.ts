import { pgTable, uuid, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { personsTable } from "./persons";

// One row per prompt email sent for a (deceased person, recipient) pair.
// Drives both the "don't resend the same prompt" rotation and the "throttle
// to roughly once every few weeks per recipient" cadence check -- see
// artifacts/api-server/src/lib/memoryPrompts.ts for the selection logic.
export const memoryPromptLogTable = pgTable(
  "memory_prompt_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => personsTable.id, { onDelete: "cascade" }),
    recipientPersonId: uuid("recipient_person_id")
      .notNull()
      .references(() => personsTable.id, { onDelete: "cascade" }),
    promptKey: varchar("prompt_key", { length: 64 }).notNull(),
    category: varchar("category", { length: 32 }),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_memory_prompt_log_pair").on(t.personId, t.recipientPersonId)],
);

export type MemoryPromptLogRow = typeof memoryPromptLogTable.$inferSelect;
export type InsertMemoryPromptLogRow = typeof memoryPromptLogTable.$inferInsert;
