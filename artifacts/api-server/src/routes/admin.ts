/**
 * Admin endpoints — protected by ADMIN_SECRET env var.
 * These are low-volume ops (backfill, one-time migrations).
 */
import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { personsTable, peopleTable, accountsTable, familyUnitsTable } from "@workspace/db";
import { syncPersonToRelationshipLayer } from "../lib/syncRelationship";
import { getPersonWithUnit } from "../middlewares/auth";
import { formatPerson, formatUnit } from "./auth";

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
 * TEMPORARY diagnostic — GET /api/admin/diag-account?email=...
 * Read-only, admin-secret-gated. Replays every step of the real login
 * handler for a given email (skipping the actual password check) to find
 * which step throws, without needing the account's real password. Remove
 * once the live login 500 is diagnosed.
 */
router.get("/admin/diag-account", async (req, res) => {
  if (!checkSecret(req, res)) return;

  const email = String(req.query["email"] ?? "").toLowerCase();
  const steps: Record<string, unknown> = {};

  try {
    const accounts = await db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.email, email))
      .limit(1);
    steps.accountLookup = { found: accounts.length > 0 };
    if (!accounts.length) {
      res.json({ steps });
      return;
    }

    const account = accounts[0];
    steps.accountRow = {
      id: account.id,
      personId: account.personId,
      passwordHashLength: account.passwordHash?.length ?? null,
      passwordHashPrefix: account.passwordHash?.slice(0, 7) ?? null,
      lastLoginAt: account.lastLoginAt,
    };

    try {
      await bcrypt.compare("dummy-probe-password", account.passwordHash);
      steps.bcryptCompare = "ok (no throw)";
    } catch (err) {
      steps.bcryptCompare = `THREW: ${(err as Error).name}: ${(err as Error).message}`;
    }

    try {
      const personWithUnit = await getPersonWithUnit(account.personId);
      steps.getPersonWithUnit = personWithUnit ? "found" : "null (no matching person+unit join)";

      if (personWithUnit) {
        const { familyUnit, ...person } = personWithUnit;
        try {
          const members = await db
            .select()
            .from(personsTable)
            .where(eq(personsTable.familyUnitId, person.familyUnitId));
          steps.membersQuery = `ok, count=${members.length}`;

          try {
            const formatted = formatPerson(person);
            const unitFormatted = formatUnit(familyUnit, members.length, members.filter((m) => m.claimed).length);
            JSON.stringify({ ...formatted, familyUnit: unitFormatted });
            steps.formatAndSerialize = "ok";
          } catch (err) {
            steps.formatAndSerialize = `THREW: ${(err as Error).name}: ${(err as Error).message}`;
          }
        } catch (err) {
          steps.membersQuery = `THREW: ${(err as Error).name}: ${(err as Error).message}`;
        }
      }
    } catch (err) {
      steps.getPersonWithUnit = `THREW: ${(err as Error).name}: ${(err as Error).message}`;
    }

    res.json({ steps });
  } catch (err) {
    res.status(500).json({ steps, fatalError: `${(err as Error).name}: ${(err as Error).message}` });
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
