import { pgTable, uuid, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { personsTable } from "./persons";

// A recipient opting out of memory prompts about one specific deceased
// person -- deliberately narrower than the existing receiveNotifications
// toggle, which controls all Olive email (birthdays etc). Opting out here
// leaves everything else on.
export const memoryPromptOptoutsTable = pgTable(
  "memory_prompt_optouts",
  {
    personId: uuid("person_id")
      .notNull()
      .references(() => personsTable.id, { onDelete: "cascade" }),
    recipientPersonId: uuid("recipient_person_id")
      .notNull()
      .references(() => personsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.personId, t.recipientPersonId] })],
);

export type MemoryPromptOptout = typeof memoryPromptOptoutsTable.$inferSelect;
