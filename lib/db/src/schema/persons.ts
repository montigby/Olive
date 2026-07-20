import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  date,
  timestamp,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { familyUnitsTable } from "./familyUnits";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const personsTable = pgTable(
  "persons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    photoUrl: text("photo_url"),
    phone: varchar("phone", { length: 30 }),
    email: varchar("email", { length: 255 }),
    addressLine1: varchar("address_line1", { length: 255 }),
    addressCity: varchar("address_city", { length: 100 }),
    addressState: varchar("address_state", { length: 100 }),
    addressZip: varchar("address_zip", { length: 20 }),
    addressCountry: varchar("address_country", { length: 100 }).default("USA"),
    birthday: date("birthday"),
    showBirthYear: boolean("show_birth_year").notNull().default(false),
    instagram: varchar("instagram", { length: 100 }),
    facebook: varchar("facebook", { length: 100 }),
    tiktok: varchar("tiktok", { length: 100 }),
    linkedin: varchar("linkedin", { length: 100 }),
    snapchat: varchar("snapchat", { length: 100 }),
    venmo: varchar("venmo", { length: 100 }),
    bereal: varchar("bereal", { length: 100 }),
    otherSocial: text("other_social"),
    relationshipLabel: varchar("relationship_label", { length: 100 }).notNull(),
    // "male" | "female" | null (unset/prefer not to say). Drives gendered
    // relationship terms (Brother/Sister, Grandma/Grandpa, etc.) -- neutral
    // terms are used when null.
    gender: varchar("gender", { length: 20 }),
    parentPersonId: uuid("parent_person_id"),
    familyUnitId: uuid("family_unit_id")
      .notNull()
      .references(() => familyUnitsTable.id, { onDelete: "cascade" }),
    isAdmin: boolean("is_admin").notNull().default(false),
    claimed: boolean("claimed").notNull().default(false),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    inviteToken: varchar("invite_token", { length: 255 }).unique(),
    inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
    tier2ContactField: varchar("tier2_contact_field", { length: 10 }).notNull().default("phone"),
    confirmedMembersOnly: boolean("confirmed_members_only").notNull().default(false),
    hideAddress: boolean("hide_address").notNull().default(false),
    hideInstagram: boolean("hide_instagram").notNull().default(false),
    hideFacebook: boolean("hide_facebook").notNull().default(false),
    hideTiktok: boolean("hide_tiktok").notNull().default(false),
    hideLinkedin: boolean("hide_linkedin").notNull().default(false),
    hideSnapchat: boolean("hide_snapchat").notNull().default(false),
    hideVenmo: boolean("hide_venmo").notNull().default(false),
    hideBereal: boolean("hide_bereal").notNull().default(false),
    hideOtherSocial: boolean("hide_other_social").notNull().default(false),
    receiveNotifications: boolean("receive_notifications").notNull().default(true),
    deceased: boolean("deceased").notNull().default(false),
    dateOfPassing: date("date_of_passing"),
    memoryCollectionEnabled: boolean("memory_collection_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_persons_email").on(t.email).where(sql`${t.email} IS NOT NULL`),
    check("chk_claimed_email", sql`${t.claimed} = false OR ${t.email} IS NOT NULL`),
  ],
);

export const insertPersonSchema = createInsertSchema(personsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPerson = z.infer<typeof insertPersonSchema>;
export type Person = typeof personsTable.$inferSelect;
