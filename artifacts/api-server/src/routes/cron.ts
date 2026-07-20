import { Router } from "express";
import { db, personsTable, relationshipsTable, memoryPromptLogTable, memoryPromptOptoutsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { daysUntilBirthday, getAgeTurning, formatBirthdayShort } from "../lib/birthday";
import { sendDayBeforeReminder, sendWeeklyDigest, sendMemoryPrompt } from "../lib/email";
import { computeVisibleSet, describeRelationship } from "../lib/visibility";
import { pickNextPrompt, renderPrompt } from "../lib/memoryPrompts";

const router = Router();

// Vercel automatically attaches `Authorization: Bearer <CRON_SECRET>` to
// requests it triggers for scheduled cron jobs when CRON_SECRET is set.
// `x-cron-secret` is kept as a second accepted header for manual testing
// (e.g. via curl/Invoke-RestMethod). Neither is spoofable without knowing
// the actual secret -- unlike the old user-agent sniffing this replaced.
function isCronAuthorized(req: import("express").Request): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers["authorization"];
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const customHeader = req.headers["x-cron-secret"];
  return Boolean(secret) && (bearerToken === secret || customHeader === secret);
}

// GET /api/cron/birthday-emails
// Called daily by Vercel Cron. Sends day-before birthday reminders and
// (on Mondays) a weekly digest of upcoming birthdays to opted-in members.
router.get("/cron/birthday-emails", async (req, res) => {
  if (!isCronAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isMonday = today.getDay() === 1;

    const allPersons = await db.select().from(personsTable);

    // Group all persons by family unit
    const byUnit = new Map<string, typeof allPersons>();
    for (const person of allPersons) {
      const group = byUnit.get(person.familyUnitId) ?? [];
      group.push(person);
      byUnit.set(person.familyUnitId, group);
    }

    let emailsSent = 0;
    const errors: string[] = [];

    for (const [unitId, members] of byUnit) {
      // Who can receive notifications in this unit
      const recipients = members.filter((m) => m.receiveNotifications && m.email);
      if (recipients.length === 0) continue;

      // All members with a birthday set -- deceased members are excluded
      // from the reminder/wish mechanic entirely (their birthday can still
      // display for remembrance on their profile, just doesn't trigger
      // "wish them happy birthday" prompts aimed at the living).
      const withBirthdays = members
        .filter((m) => m.birthday && !m.deceased)
        .map((m) => ({
          ...m,
          daysUntil: daysUntilBirthday(m.birthday!),
          age: getAgeTurning(m.birthday!),
          dateFormatted: formatBirthdayShort(m.birthday!),
        }));

      // Day-before reminders
      const tomorrow = withBirthdays.filter((m) => m.daysUntil === 1);
      for (const birthdayPerson of tomorrow) {
        for (const recipient of recipients) {
          try {
            await sendDayBeforeReminder({
              to: recipient.email!,
              recipientName: recipient.firstName,
              birthdayPersonName: `${birthdayPerson.firstName} ${birthdayPerson.lastName}`,
              birthdayPersonId: birthdayPerson.id,
              age: birthdayPerson.age,
            });
            emailsSent++;
          } catch (err) {
            errors.push(`day-before to ${recipient.email}: ${err}`);
          }
        }
      }

      // Weekly digest — Mondays only, birthdays in the next 7 days
      if (isMonday) {
        const thisWeek = withBirthdays
          .filter((m) => m.daysUntil >= 1 && m.daysUntil <= 7)
          .sort((a, b) => a.daysUntil - b.daysUntil);

        if (thisWeek.length > 0) {
          for (const recipient of recipients) {
            try {
              await sendWeeklyDigest({
                to: recipient.email!,
                recipientName: recipient.firstName,
                unitId,
                upcomingBirthdays: thisWeek.map((m) => ({
                  name: `${m.firstName} ${m.lastName}`,
                  daysUntil: m.daysUntil,
                  dateFormatted: m.dateFormatted,
                  age: m.age,
                  personId: m.id,
                })),
              });
              emailsSent++;
            } catch (err) {
              errors.push(`weekly digest to ${recipient.email}: ${err}`);
            }
          }
        }
      }
    }

    res.json({ ok: true, emailsSent, errors });
  } catch (err) {
    console.error("Cron birthday-emails error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Minimum gap between prompt emails to the same (deceased person, recipient)
// pair -- a slow drip, not a campaign. The very first prompt for a pair
// (no log rows yet) always goes out on the next run regardless of this gap.
const MIN_DAYS_BETWEEN_PROMPTS = 21;

// GET /api/cron/memory-prompts
// Called daily by Vercel Cron. For every profile with memory collection
// turned on, finds close relatives (via the same tier system that drives
// privacy visibility -- not a blanket send) and, respecting a per-recipient
// cadence and opt-outs, emails the next prompt in rotation.
router.get("/cron/memory-prompts", async (req, res) => {
  if (!isCronAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const collecting = await db
      .select()
      .from(personsTable)
      .where(eq(personsTable.memoryCollectionEnabled, true));

    let emailsSent = 0;
    const errors: string[] = [];

    // Cache per family unit so multiple deceased profiles in the same unit
    // don't refetch members/relationships repeatedly.
    const unitCache = new Map<string, { members: (typeof personsTable.$inferSelect)[]; relationships: { fromPerson: string; toPerson: string; type: string }[] }>();

    for (const person of collecting) {
      if (!unitCache.has(person.familyUnitId)) {
        const [members, relationships] = await Promise.all([
          db.select().from(personsTable).where(eq(personsTable.familyUnitId, person.familyUnitId)),
          db
            .select({ fromPerson: relationshipsTable.fromPerson, toPerson: relationshipsTable.toPerson, type: relationshipsTable.type })
            .from(relationshipsTable)
            .where(eq(relationshipsTable.familyId, person.familyUnitId)),
        ]);
        unitCache.set(person.familyUnitId, { members, relationships });
      }
      const { members, relationships } = unitCache.get(person.familyUnitId)!;

      // Close relatives only (tiers 1-2 relative to the deceased person),
      // scoped to their own family unit -- computeVisibleSet already
      // excludes tier 3/4 (extended/unrelated) by construction.
      const visibleSet = computeVisibleSet(person, members, relationships);
      const recipientIds = [...visibleSet.entries()]
        .filter(([id, tier]) => id !== person.id && tier <= 2)
        .map(([id]) => id);

      for (const recipientId of recipientIds) {
        const recipient = members.find((m) => m.id === recipientId);
        if (!recipient || !recipient.claimed || !recipient.email || !recipient.receiveNotifications) continue;

        try {
          const [optOut] = await db
            .select()
            .from(memoryPromptOptoutsTable)
            .where(and(eq(memoryPromptOptoutsTable.personId, person.id), eq(memoryPromptOptoutsTable.recipientPersonId, recipientId)))
            .limit(1);
          if (optOut) continue;

          const log = await db
            .select()
            .from(memoryPromptLogTable)
            .where(and(eq(memoryPromptLogTable.personId, person.id), eq(memoryPromptLogTable.recipientPersonId, recipientId)));

          if (log.length > 0) {
            const lastSent = Math.max(...log.map((r) => r.sentAt.getTime()));
            const daysSince = (Date.now() - lastSent) / (1000 * 60 * 60 * 24);
            if (daysSince < MIN_DAYS_BETWEEN_PROMPTS) continue;
          }

          const choice = pickNextPrompt(log);
          const relationshipLabel = describeRelationship(recipientId, person.id, members, relationships);
          const promptText = renderPrompt(choice.text, relationshipLabel, person.firstName);

          await sendMemoryPrompt({
            to: recipient.email,
            recipientName: recipient.firstName,
            personName: `${person.firstName} ${person.lastName}`,
            personId: person.id,
            promptText,
          });

          await db.insert(memoryPromptLogTable).values({
            personId: person.id,
            recipientPersonId: recipientId,
            promptKey: choice.key,
            category: choice.category,
          });

          emailsSent++;
        } catch (err) {
          errors.push(`memory prompt to ${recipient?.email}: ${err}`);
        }
      }
    }

    res.json({ ok: true, emailsSent, errors });
  } catch (err) {
    console.error("Cron memory-prompts error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
