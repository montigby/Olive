import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const familyUnitsTable = pgTable(
  "family_units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unitName: varchar("unit_name", { length: 255 }).notNull(),
    unitCode: varchar("unit_code", { length: 12 }).notNull().unique(),
    parentUnitId: uuid("parent_unit_id"),
    parentLinkStatus: varchar("parent_link_status", { length: 20 })
      .notNull()
      .default("none"),
    parentLinkedAt: timestamp("parent_linked_at", { withTimezone: true }),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "chk_parent_link_status",
      sql`${t.parentLinkStatus} IN ('none', 'pending', 'accepted')`,
    ),
  ],
);

export const insertFamilyUnitSchema = createInsertSchema(familyUnitsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFamilyUnit = z.infer<typeof insertFamilyUnitSchema>;
export type FamilyUnit = typeof familyUnitsTable.$inferSelect;
