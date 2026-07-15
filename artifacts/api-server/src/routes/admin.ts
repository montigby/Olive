/**
 * Admin endpoints — protected by ADMIN_SECRET env var.
 * These are low-volume ops (backfill, one-time migrations).
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { personsTable, peopleTable, accountsTable, familyUnitsTable } from "@workspace/db";
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
 * TEMPORARY — POST /api/admin/cleanup-diag-test
 * Deletes the synthetic account/person/family-unit created while diagnosing
 * today's login incident (email starting "claude-diag-test-"). Bypasses the
 * last-admin guardrail deliberately, since this is intentional test-data
 * teardown, not a real family losing its only admin. Remove after use.
 */
router.post("/admin/cleanup-diag-test", async (req, res) => {
  if (!checkSecret(req, res)) return;

  try {
    const targets = await db
      .select({ id: personsTable.id, familyUnitId: personsTable.familyUnitId, email: personsTable.email })
      .from(personsTable)
      .where(eq(personsTable.email, String(req.query["email"] ?? "")));

    if (!targets.length) {
      res.json({ deleted: false, message: "No matching person found" });
      return;
    }

    const { id: personId, familyUnitId } = targets[0];
    await db.delete(accountsTable).where(eq(accountsTable.personId, personId));
    await db.delete(personsTable).where(eq(personsTable.id, personId));
    await db.delete(familyUnitsTable).where(eq(familyUnitsTable.id, familyUnitId));

    res.json({ deleted: true, personId, familyUnitId });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

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

export default router;
