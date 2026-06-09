import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { familyUnitsTable } from "./familyUnits";
import { peopleTable } from "./people";

// One shareable invite token per family. Regenerating revokes the previous
// row (sets revoked_at); a partial unique index (in SQL migration 0009)
// enforces "at most one active token per family_id".
export const inviteTokensTable = pgTable("invite_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id")
    .notNull()
    .references(() => familyUnitsTable.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  createdBy: uuid("created_by").references(() => peopleTable.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  maxUses: integer("max_uses"),
  useCount: integer("use_count").notNull().default(0),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InviteToken = typeof inviteTokensTable.$inferSelect;
export type InsertInviteToken = typeof inviteTokensTable.$inferInsert;
