import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { accountsTable } from "./accounts";

// One-time, expiring magic tokens for non-blocking email verification.
// Mirrors passwordResetTokensTable's shape exactly: a unique token, an
// expiry, and a used-tracking timestamp instead of a boolean so "when" is
// preserved. A row is single-use -- usedAt gets set the moment the token is
// redeemed via POST /auth/verify-email, and both verify-email and
// resend-verification also invalidate (mark usedAt on) every other
// still-live token for the same account at that point so a stale, unused
// verification email can never be replayed later.
//
// Verification is deliberately non-blocking (see auth.ts) -- this table only
// exists so the app can eventually learn whether an address is real, not to
// gate anything. Expiry is 7 days (vs. password reset's 1 hour) since there's
// no urgency pressure on a verification click the way there is on a reset.
export const emailVerificationTokensTable = pgTable("email_verification_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accountsTable.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmailVerificationToken = typeof emailVerificationTokensTable.$inferSelect;
export type InsertEmailVerificationToken = typeof emailVerificationTokensTable.$inferInsert;
