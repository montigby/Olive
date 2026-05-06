import { pgTable, uuid, timestamp } from "drizzle-orm/pg-core";
import { familyUnitsTable } from "./familyUnits";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const familyGroupsTable = pgTable("family_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  rootUnitId: uuid("root_unit_id")
    .notNull()
    .references(() => familyUnitsTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFamilyGroupSchema = createInsertSchema(familyGroupsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertFamilyGroup = z.infer<typeof insertFamilyGroupSchema>;
export type FamilyGroup = typeof familyGroupsTable.$inferSelect;
