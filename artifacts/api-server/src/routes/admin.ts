/**
 * Admin endpoints — protected by ADMIN_SECRET env var.
 * These are low-volume ops (backfill, one-time migrations).
 */
import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { personsTable, peopleTable, relationshipsTable } from "@workspace/db";
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
 * GET /api/admin/graph-debug/:unitId
 *
 * TEMPORARY diagnostic endpoint — dumps raw relationshipLabel/parentPersonId
 * per member plus the explicit relationships-table rows for a unit, to
 * debug viewer-relative relationship label bugs. Remove once the
 * describeRelationship bugs are fixed and verified live.
 */
router.get("/admin/graph-debug/:unitId", async (req, res) => {
  if (!checkSecret(req, res)) return;

  const { unitId } = req.params;
  const members = await db
    .select({
      id: personsTable.id,
      firstName: personsTable.firstName,
      lastName: personsTable.lastName,
      relationshipLabel: personsTable.relationshipLabel,
      parentPersonId: personsTable.parentPersonId,
      isAdmin: personsTable.isAdmin,
    })
    .from(personsTable)
    .where(eq(personsTable.familyUnitId, unitId));

  const nameById = new Map(members.map((m) => [m.id, `${m.firstName} ${m.lastName ?? ""}`.trim()]));

  const relationships = await db
    .select({
      fromPerson: relationshipsTable.fromPerson,
      toPerson: relationshipsTable.toPerson,
      type: relationshipsTable.type,
    })
    .from(relationshipsTable)
    .where(eq(relationshipsTable.familyId, unitId));

  res.json({
    members: members.map((m) => ({
      ...m,
      parentPersonName: m.parentPersonId ? nameById.get(m.parentPersonId) ?? "(outside unit)" : null,
    })),
    relationships: relationships.map((r) => ({
      from: nameById.get(r.fromPerson) ?? r.fromPerson,
      to: nameById.get(r.toPerson) ?? r.toPerson,
      type: r.type,
    })),
  });
});

/**
 * GET /api/admin/find-unit?name=Zachary
 *
 * TEMPORARY diagnostic endpoint — finds familyUnitId(s) for persons matching
 * a first-name substring. Remove alongside graph-debug.
 */
router.get("/admin/find-unit", async (req, res) => {
  if (!checkSecret(req, res)) return;

  const name = String(req.query.name ?? "").toLowerCase();
  const all = await db
    .select({
      id: personsTable.id,
      firstName: personsTable.firstName,
      lastName: personsTable.lastName,
      familyUnitId: personsTable.familyUnitId,
    })
    .from(personsTable);

  res.json(all.filter((p) => p.firstName.toLowerCase().includes(name)));
});

/**
 * POST /api/admin/fix-stale-sibling-relationships
 *
 * ONE-SHOT data fix. Found via graph-debug: three relationships-table rows
 * exist that claim a sibling is a biological_parent (e.g. "Rachel is
 * Jackson's child", "Jayne is Jackson's parent") -- almost certainly stale
 * rows written by syncPersonToRelationshipLayer back when these three were
 * first added with a different (later-corrected) relationshipLabel, since
 * sync only runs once at insert and never re-runs on a label edit. These
 * bogus rows corrupted viewer-relative relationship labels for anyone
 * routed through them. Deletes exactly the specified fromPerson/toPerson/
 * type rows -- nothing broader. Remove this endpoint once run.
 */
router.post("/admin/fix-stale-sibling-relationships", async (req, res) => {
  if (!checkSecret(req, res)) return;

  const rows: Array<{ fromPerson: string; toPerson: string; type: string }> = req.body?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: "Bad Request", message: "Provide { rows: [{ fromPerson, toPerson, type }] }" });
    return;
  }

  let deleted = 0;
  for (const r of rows) {
    const result = await db
      .delete(relationshipsTable)
      .where(
        and(
          eq(relationshipsTable.fromPerson, r.fromPerson),
          eq(relationshipsTable.toPerson, r.toPerson),
          eq(relationshipsTable.type, r.type),
        ),
      )
      .returning({ id: relationshipsTable.id });
    deleted += result.length;
  }

  res.json({ ok: true, deleted });
});

export default router;
