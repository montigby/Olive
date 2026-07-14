/**
 * Admin endpoints — protected by ADMIN_SECRET env var.
 * These are low-volume ops (backfill, one-time migrations).
 */
import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { personsTable, peopleTable } from "@workspace/db";
import { syncPersonToRelationshipLayer } from "../lib/syncRelationship";

const router = Router();

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "olive-admin-2026";
if (!process.env.ADMIN_SECRET && process.env.NODE_ENV === "production") {
  console.error("[admin] WARNING: ADMIN_SECRET env var is not set — using insecure default");
}

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
 * POST /api/admin/migrate-add-waitlist
 * ONE-SHOT schema migration for lib/db/migrations/0014_waitlist_signups.sql.
 * Idempotent via IF NOT EXISTS. Remove this endpoint once confirmed applied.
 */
router.post("/admin/migrate-add-waitlist", async (req, res) => {
  if (!checkSecret(req, res)) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS waitlist_signups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_signups_email ON waitlist_signups (email)
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: "Migration failed", message: err?.message ?? String(err) });
  }
});

/** TEMPORARY: clean up the manual verification row from waitlist testing. */
router.post("/admin/cleanup-waitlist-test", async (req, res) => {
  if (!checkSecret(req, res)) return;
  await db.execute(sql`DELETE FROM waitlist_signups WHERE email = 'test-verify@example.com'`);
  res.json({ ok: true });
});

export default router;
