import { pgTable, uuid, varchar, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { familyUnitsTable } from "./familyUnits";
import { personsTable } from "./persons";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const unitLinkRequestsTable = pgTable(
  "unit_link_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestingUnitId: uuid("requesting_unit_id")
      .notNull()
      .references(() => familyUnitsTable.id, { onDelete: "cascade" }),
    targetUnitId: uuid("target_unit_id")
      .notNull()
      .references(() => familyUnitsTable.id, { onDelete: "cascade" }),
    connectorPersonId: uuid("connector_person_id")
      .notNull()
      .references(() => personsTable.id, { onDelete: "restrict" }),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => personsTable.id, { onDelete: "restrict" }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    respondedBy: uuid("responded_by").references(() => personsTable.id, {
      onDelete: "set null",
    }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("chk_link_req_status", sql`${t.status} IN ('pending', 'accepted', 'declined')`),
  ],
);

export const insertUnitLinkRequestSchema = createInsertSchema(
  unitLinkRequestsTable,
).omit({ id: true, createdAt: true });

export type InsertUnitLinkRequest = z.infer<typeof insertUnitLinkRequestSchema>;
export type UnitLinkRequest = typeof unitLinkRequestsTable.$inferSelect;
