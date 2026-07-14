/**
 * Admin endpoints — protected by ADMIN_SECRET env var.
 * These are low-volume ops (backfill, one-time migrations).
 */
import { Router } from "express";
import { eq, sql } from "drizzle-orm";
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
 * POST /api/admin/migrate-add-gender
 *
 * ONE-SHOT schema migration for lib/db/migrations/0013_person_gender.sql
 * (drizzle-kit push is banned from the build per CLAUDE.md, so schema
 * changes go out via a one-shot endpoint like this one). Idempotent via
 * IF NOT EXISTS. Remove this endpoint once confirmed applied.
 */
router.post("/admin/migrate-add-gender", async (req, res) => {
  if (!checkSecret(req, res)) return;
  try {
    await db.execute(sql`ALTER TABLE persons ADD COLUMN IF NOT EXISTS gender VARCHAR(20)`);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: "Migration failed", message: err?.message ?? String(err) });
  }
});

// relationshipLabel -> gender, inferred from the exact groupings the Add
// Member form (RELATIONSHIP_OPTIONS in members.tsx) already presents, plus
// the additional label variants visibility.ts's own heuristics recognize
// (mother/father, brother-in-law, grandma/grandpa, etc.). A relationshipLabel
// of "Sister" does mean the person is female regardless of who added them or
// from whose perspective it was recorded, so this is a real inference, not
// a guess.
const FEMALE_LABELS = new Set([
  "daughter", "granddaughter", "sister", "aunt", "niece", "wife", "mom", "mother",
  "grandma", "grandmother", "nana", "nan", "gram", "stepdaughter", "mother-in-law", "sister-in-law",
]);
const MALE_LABELS = new Set([
  "son", "grandson", "brother", "uncle", "nephew", "husband", "dad", "father",
  "grandpa", "grandfather", "papa", "pop", "pops", "gramps", "stepson", "father-in-law", "brother-in-law",
]);
function inferGender(relationshipLabel: string): "male" | "female" | null {
  const l = relationshipLabel.toLowerCase().trim();
  if (FEMALE_LABELS.has(l)) return "female";
  if (MALE_LABELS.has(l)) return "male";
  return null;
}

/**
 * POST /api/admin/backfill-gender
 *
 * ONE-SHOT data backfill: infer `gender` for every existing person from
 * their current relationshipLabel where it unambiguously implies one
 * (see inferGender). Only touches rows where gender IS NULL, so it's safe
 * to re-run and won't clobber anyone who's already set their gender
 * explicitly. Remove this endpoint once run.
 */
router.post("/admin/backfill-gender", async (req, res) => {
  if (!checkSecret(req, res)) return;

  const allPersons = await db
    .select({ id: personsTable.id, relationshipLabel: personsTable.relationshipLabel, gender: personsTable.gender })
    .from(personsTable);

  let updated = 0;
  let skipped = 0;
  for (const p of allPersons) {
    if (p.gender) {
      skipped++;
      continue;
    }
    const inferred = inferGender(p.relationshipLabel);
    if (!inferred) {
      skipped++;
      continue;
    }
    await db.update(personsTable).set({ gender: inferred }).where(eq(personsTable.id, p.id));
    updated++;
  }

  res.json({ ok: true, updated, skipped, total: allPersons.length });
});

export default router;
