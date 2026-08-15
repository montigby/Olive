import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { accountsTable } from "./accounts";

// One-time, expiring magic tokens for the forgot-password flow. Mirrors the
// shape of inviteTokensTable: a unique token, an expiry, and a used-tracking
// timestamp instead of a boolean so "when" is preserved. A row is single-use
// -- usedAt gets set the moment the token is redeemed via
// POST /auth/reset-password, and reset-password also invalidates (marks
// usedAt on) every other still-live token for the same account at that
// point so a stale, unused reset email can never be replayed later.
export const passwordResetTokensTable = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accountsTable.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PasswordResetToken = typeof passwordResetTokensTable.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokensTable.$inferInsert;
