import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";
import { personsTable } from "./persons";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const accountsTable = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: uuid("person_id")
    .notNull()
    .unique()
    .references(() => personsTable.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  // Null until the account's email address is confirmed via a
  // POST /auth/verify-email magic link. Verification is non-blocking -- this
  // column is never checked to gate login or any feature, it only records
  // when (if ever) the address was confirmed real.
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
});

export const insertAccountSchema = createInsertSchema(accountsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accountsTable.$inferSelect;
