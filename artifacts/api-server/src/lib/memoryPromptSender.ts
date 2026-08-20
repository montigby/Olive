import { db, personsTable, relationshipsTable, memoryPromptLogTable, memoryPromptOptoutsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { sendMemoryPrompt } from "./email";
import { computeVisibleSet, describeRelationship } from "./visibility";
import { pickNextPrompt, renderPrompt } from "./memoryPrompts";

// Minimum gap between prompt emails to the same (deceased person, recipient)
// pair -- a slow drip, not a campaign. The very first prompt for a pair
// (no log rows yet) always goes out regardless of this gap.
const MIN_DAYS_BETWEEN_PROMPTS = 21;

// Shared by the daily cron (GET /api/cron/memory-prompts, all collecting
// profiles) and the memory-collection opt-in endpoint (one profile, fired
// immediately so the first prompt doesn't wait for the next cron run).
// Never throws -- every failure is caught and returned in `errors` so a
// caller can treat this as best-effort, matching CLAUDE.md rule #5's
// pattern for non-critical side effects.
export async function sendMemoryPromptsForPerson(personId: string): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;

  try {
    const [person] = await db.select().from(personsTable).where(eq(personsTable.id, personId)).limit(1);
    if (!person || !person.memoryCollectionEnabled) return { sent, errors };

    const [members, relationships] = await Promise.all([
      db.select().from(personsTable).where(eq(personsTable.familyUnitId, person.familyUnitId)),
      db
        .select({ fromPerson: relationshipsTable.fromPerson, toPerson: relationshipsTable.toPerson, type: relationshipsTable.type })
        .from(relationshipsTable)
        .where(eq(relationshipsTable.familyId, person.familyUnitId)),
    ]);

    // Close relatives only (tiers 1-2 relative to the deceased person) --
    // computeVisibleSet already excludes tier 3/4 (extended/unrelated).
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
          recipientPersonId: recipient.id,
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

        sent++;
      } catch (err) {
        errors.push(`memory prompt to ${recipient?.email}: ${err}`);
      }
    }
  } catch (err) {
    errors.push(`sendMemoryPromptsForPerson(${personId}): ${err}`);
  }

  return { sent, errors };
}
