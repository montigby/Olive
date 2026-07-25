/**
 * Admin endpoints — protected by ADMIN_SECRET env var.
 * These are low-volume ops (backfill, one-time migrations).
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  personsTable,
  peopleTable,
  familyUnitsTable,
  relationshipsTable,
  unitLinkRequestsTable,
} from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { syncPersonToRelationshipLayer } from "../lib/syncRelationship";

const router = Router();

if (!process.env.ADMIN_SECRET) {
  throw new Error(
    "ADMIN_SECRET must be set. Did you forget to configure it in Vercel?",
  );
}
const ADMIN_SECRET = process.env.ADMIN_SECRET;

function checkSecret(req: any, res: any): boolean {
  const secret = req.headers["x-admin-secret"] ?? req.query["secret"];
  if (secret !== ADMIN_SECRET) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

/**
 * POST /api/admin/backfill-people
 *
 * One-time backfill: for each existing person in personsTable that is NOT yet
 * in peopleTable, insert them and create their relationship edges. Safe to call
 * multiple times (idempotent via onConflictDoNothing + existing-edge guards).
 */
router.post("/admin/backfill-people", async (req, res) => {
  if (!checkSecret(req, res)) return;

  try {
    // Load all persons grouped by family unit
    const allPersons = await db.select().from(personsTable);

    // Load already-synced people IDs to skip them
    const alreadySynced = await db.select({ id: peopleTable.id }).from(peopleTable);
    const syncedIds = new Set(alreadySynced.map((r) => r.id));

    // Group by familyUnitId so we can find the admin per unit
    const byUnit = new Map<string, typeof allPersons>();
    for (const p of allPersons) {
      if (!byUnit.has(p.familyUnitId)) byUnit.set(p.familyUnitId, []);
      byUnit.get(p.familyUnitId)!.push(p);
    }

    let synced = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const [unitId, members] of byUnit) {
      const admin = members.find((m) => m.isAdmin);
      if (!admin) {
        errors.push(`Unit ${unitId}: no admin found, skipping`);
        continue;
      }

      for (const person of members) {
        if (syncedIds.has(person.id)) {
          skipped++;
          continue;
        }
        try {
          await syncPersonToRelationshipLayer({
            personId: person.id,
            familyId: unitId,
            firstName: person.firstName,
            lastName: person.lastName,
            label: person.relationshipLabel,
            adminId: admin.id,
            parentPersonId: person.parentPersonId,
          });
          synced++;
        } catch (e: any) {
          errors.push(`Person ${person.id} (${person.firstName}): ${e?.message}`);
        }
      }
    }

    res.json({ ok: true, synced, skipped, errors });
  } catch (err: any) {
    res.status(500).json({ error: "Backfill failed", message: err?.message ?? String(err) });
  }
});

/**
 * DELETE /api/admin/family-units/:unitId
 *
 * Wipes a family unit entirely -- not a user-facing feature (there's no button
 * for this anywhere in the app), just a cleanup tool for orphaned/test units
 * that self-delete can't reach (e.g. no known login, or multiple members left
 * behind). Members' self-delete (DELETE /api/persons/:personId) is the normal
 * path and already handles the common "last person leaves" case on its own;
 * reach for this only when that's not possible.
 *
 * persons.familyUnitId cascades to accounts/life_events/memories/prompt-log/
 * prompt-optouts/invite_tokens/claim_requests automatically, but two things
 * don't: (1) people/relationships share UUIDs with persons by convention
 * only, not FK, so nothing cascades them; (2) unit_link_requests references
 * persons with ON DELETE RESTRICT (not cascade), so it has to go first or
 * the cascade from family_units can fail partway through.
 */
router.delete("/admin/family-units/:unitId", async (req, res) => {
  if (!checkSecret(req, res)) return;

  const unitId = String(req.params.unitId);

  try {
    const [unit] = await db
      .select({ id: familyUnitsTable.id, unitName: familyUnitsTable.unitName })
      .from(familyUnitsTable)
      .where(eq(familyUnitsTable.id, unitId))
      .limit(1);

    if (!unit) {
      res.status(404).json({ error: "Not found", message: "Family unit not found" });
      return;
    }

    const members = await db
      .select({ id: personsTable.id })
      .from(personsTable)
      .where(eq(personsTable.familyUnitId, unitId));

    await db
      .delete(unitLinkRequestsTable)
      .where(
        or(
          eq(unitLinkRequestsTable.requestingUnitId, unitId),
          eq(unitLinkRequestsTable.targetUnitId, unitId),
        ),
      );
    await db.delete(relationshipsTable).where(eq(relationshipsTable.familyId, unitId));
    await db.delete(peopleTable).where(eq(peopleTable.familyId, unitId));
    await db.delete(familyUnitsTable).where(eq(familyUnitsTable.id, unitId));

    res.json({ ok: true, unitName: unit.unitName, membersDeleted: members.length });
  } catch (err: any) {
    res.status(500).json({ error: "Delete failed", message: err?.message ?? String(err) });
  }
});

export default router;
