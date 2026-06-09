import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { familyUnitsTable } from "./familyUnits";
import { peopleTable } from "./people";
import { inviteTokensTable } from "./inviteTokens";

// One row per claim attempt against a family via an invite token. Status
// values: pending, approved, rejected, superseded (set when another claim
// against the same target wins first). Type values: claim_existing (matched
// to an unclaimed people node) or create_new (claimer was not in the tree).
export const claimRequestsTable = pgTable(
  "claim_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => familyUnitsTable.id, { onDelete: "cascade" }),
    inviteTokenId: uuid("invite_token_id")
      .notNull()
      .references(() => inviteTokensTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    targetPersonId: uuid("target_person_id").references(() => peopleTable.id, {
      onDelete: "cascade",
    }),
    claimerDisplayName: text("claimer_display_name").notNull(),
    claimerContact: text("claimer_contact"),
    claimerSignal: jsonb("claimer_signal").notNull().default(sql`'{}'::jsonb`),
    status: text("status").notNull().default("pending"),
    approverPersonId: uuid("approver_person_id").references(() => peopleTable.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "chk_claim_requests_type",
      sql`${t.type} IN ('claim_existing', 'create_new')`,
    ),
    check(
      "chk_claim_requests_status",
      sql`${t.status} IN ('pending', 'approved', 'rejected', 'superseded')`,
    ),
  ],
);

export type ClaimRequest = typeof claimRequestsTable.$inferSelect;
export type InsertClaimRequest = typeof claimRequestsTable.$inferInsert;
