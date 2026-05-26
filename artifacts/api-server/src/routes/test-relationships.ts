/**
 * TEMPORARY: Relationship data-layer test runner.
 * Runs the 6 test cases against the real database and returns results as JSON.
 * Protected by X-Test-Secret header. Remove this file after tests pass.
 */
import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, peopleTable, relationshipsTable } from "@workspace/db";
import {
  addPerson,
  addRelationship,
  getCurrentSpouse,
  getSiblings,
} from "@workspace/db/relationships";

const router = Router();

const TEST_SECRET = process.env.TEST_SECRET ?? "olive-test-2026";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function cleanFamily(familyId: string) {
  await db.delete(peopleTable).where(eq(peopleTable.familyId, familyId));
}

function newFamilyId(): string {
  return crypto.randomUUID();
}

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // ── Test 1: Trevor case ─────────────────────────────────────────────────
  {
    const name = "Trevor case: unmarried person has no spurious relationships";
    const familyId = newFamilyId();
    try {
      const mom = await addPerson(db, familyId, { firstName: "Mom" });
      const dad = await addPerson(db, familyId, { firstName: "Dad" });
      const tanner = await addPerson(db, familyId, { firstName: "Tanner" }, [
        { relatedPersonId: mom.id, type: "biological_parent" },
        { relatedPersonId: dad.id, type: "biological_parent" },
      ]);
      const trevor = await addPerson(db, familyId, { firstName: "Trevor" }, [
        { relatedPersonId: mom.id, type: "biological_parent" },
        { relatedPersonId: dad.id, type: "biological_parent" },
      ]);

      const trevoRels = await db
        .select()
        .from(relationshipsTable)
        .where(eq(relationshipsTable.fromPerson, trevor.id));

      const spouseTypes = trevoRels.filter((r) =>
        ["spouse", "partner", "ex_spouse"].includes(r.type),
      );
      if (spouseTypes.length !== 0) throw new Error(`Expected 0 spouse-type rels, got ${spouseTypes.length}`);
      if (trevoRels.length !== 2) throw new Error(`Expected 2 parent rels, got ${trevoRels.length}`);
      if (!trevoRels.every((r) => r.type === "biological_parent"))
        throw new Error("Non-parent relationship found on Trevor");

      const siblings = await getSiblings(db, trevor.id);
      if (siblings.length !== 1) throw new Error(`Expected 1 sibling, got ${siblings.length}`);
      if (siblings[0] !== tanner.id) throw new Error("Sibling is wrong person");

      results.push({ name, passed: true });
    } catch (e: any) {
      results.push({ name, passed: false, error: e.message });
    } finally {
      await cleanFamily(familyId);
    }
  }

  // ── Test 2: Self-relationship rejected ───────────────────────────────────
  {
    const name = "Self-relationship is rejected";
    const familyId = newFamilyId();
    try {
      const alice = await addPerson(db, familyId, { firstName: "Alice" });
      let threw = false;
      try {
        await addRelationship(db, familyId, alice.id, alice.id, "spouse");
      } catch {
        threw = true;
      }
      if (!threw) throw new Error("Expected self-relationship to throw");
      results.push({ name, passed: true });
    } catch (e: any) {
      results.push({ name, passed: false, error: e.message });
    } finally {
      await cleanFamily(familyId);
    }
  }

  // ── Test 3: Cycle prevention ─────────────────────────────────────────────
  {
    const name = "Cycle prevention: B cannot be parent of A when A is parent of B";
    const familyId = newFamilyId();
    try {
      const a = await addPerson(db, familyId, { firstName: "A" });
      const b = await addPerson(db, familyId, { firstName: "B" });
      await addRelationship(db, familyId, a.id, b.id, "biological_parent");
      let threw = false;
      try {
        await addRelationship(db, familyId, b.id, a.id, "biological_parent");
      } catch {
        threw = true;
      }
      if (!threw) throw new Error("Expected cycle error");
      results.push({ name, passed: true });
    } catch (e: any) {
      results.push({ name, passed: false, error: e.message });
    } finally {
      await cleanFamily(familyId);
    }
  }

  // ── Test 4: Symmetric spouse ─────────────────────────────────────────────
  {
    const name = "Symmetric spouse: A→B creates B→A automatically";
    const familyId = newFamilyId();
    try {
      const alice = await addPerson(db, familyId, { firstName: "Alice" });
      const bob = await addPerson(db, familyId, { firstName: "Bob" });
      await addRelationship(db, familyId, alice.id, bob.id, "spouse");

      const fwd = await db.select().from(relationshipsTable).where(
        and(
          eq(relationshipsTable.fromPerson, alice.id),
          eq(relationshipsTable.toPerson, bob.id),
          eq(relationshipsTable.type, "spouse"),
        ),
      );
      const rev = await db.select().from(relationshipsTable).where(
        and(
          eq(relationshipsTable.fromPerson, bob.id),
          eq(relationshipsTable.toPerson, alice.id),
          eq(relationshipsTable.type, "spouse"),
        ),
      );
      if (fwd.length !== 1) throw new Error("Missing A→B spouse edge");
      if (rev.length !== 1) throw new Error("Missing B→A reverse spouse edge");
      results.push({ name, passed: true });
    } catch (e: any) {
      results.push({ name, passed: false, error: e.message });
    } finally {
      await cleanFamily(familyId);
    }
  }

  // ── Test 5: Spouse uniqueness ─────────────────────────────────────────────
  {
    const name = "Current spouse uniqueness: old spouse demoted to ex_spouse";
    const familyId = newFamilyId();
    try {
      const alice = await addPerson(db, familyId, { firstName: "Alice" });
      const bob = await addPerson(db, familyId, { firstName: "Bob" });
      const carol = await addPerson(db, familyId, { firstName: "Carol" });

      await addRelationship(db, familyId, alice.id, bob.id, "spouse");
      const spouseBefore = await getCurrentSpouse(db, alice.id);
      if (spouseBefore !== bob.id) throw new Error("Bob should be current spouse before");

      await addRelationship(db, familyId, alice.id, carol.id, "spouse");

      const currentEdge = await db.select().from(relationshipsTable).where(
        and(
          eq(relationshipsTable.fromPerson, alice.id),
          eq(relationshipsTable.toPerson, bob.id),
          eq(relationshipsTable.type, "spouse"),
        ),
      );
      if (currentEdge.length !== 0) throw new Error("Old spouse edge should be gone");

      const exEdge = await db.select().from(relationshipsTable).where(
        and(
          eq(relationshipsTable.fromPerson, alice.id),
          eq(relationshipsTable.toPerson, bob.id),
          eq(relationshipsTable.type, "ex_spouse"),
        ),
      );
      if (exEdge.length !== 1) throw new Error("Expected ex_spouse edge");
      if (!exEdge[0]?.endDate) throw new Error("ex_spouse edge missing endDate");

      const newSpouse = await getCurrentSpouse(db, alice.id);
      if (newSpouse !== carol.id) throw new Error("Carol should be current spouse");

      results.push({ name, passed: true });
    } catch (e: any) {
      results.push({ name, passed: false, error: e.message });
    } finally {
      await cleanFamily(familyId);
    }
  }

  // ── Test 6: In-laws not auto-created ────────────────────────────────────
  {
    const name = "In-laws not auto-created when A marries B";
    const familyId = newFamilyId();
    try {
      const alice = await addPerson(db, familyId, { firstName: "Alice" });
      const bob = await addPerson(db, familyId, { firstName: "Bob" });
      const bobSibling = await addPerson(db, familyId, { firstName: "BobSibling" });
      const sharedParent = await addPerson(db, familyId, { firstName: "BobParent" });

      await addRelationship(db, familyId, sharedParent.id, bob.id, "biological_parent");
      await addRelationship(db, familyId, sharedParent.id, bobSibling.id, "biological_parent");
      await addRelationship(db, familyId, alice.id, bob.id, "spouse");

      const aliceToSibling = await db.select().from(relationshipsTable).where(
        and(
          eq(relationshipsTable.fromPerson, alice.id),
          eq(relationshipsTable.toPerson, bobSibling.id),
        ),
      );
      if (aliceToSibling.length !== 0) throw new Error("Expected no in-law edge (from)");

      const siblingToAlice = await db.select().from(relationshipsTable).where(
        and(
          eq(relationshipsTable.fromPerson, bobSibling.id),
          eq(relationshipsTable.toPerson, alice.id),
        ),
      );
      if (siblingToAlice.length !== 0) throw new Error("Expected no in-law edge (to)");

      results.push({ name, passed: true });
    } catch (e: any) {
      results.push({ name, passed: false, error: e.message });
    } finally {
      await cleanFamily(familyId);
    }
  }

  return results;
}

// GET /api/test-relationships?secret=<TEST_SECRET>
router.get("/test-relationships", async (req, res, next) => {
  const secret = req.headers["x-test-secret"] ?? req.query["secret"];
  if (secret !== TEST_SECRET) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    const results = await runTests();
    const passed = results.filter((r) => r.passed).length;
    const total = results.length;

    res.json({
      summary: `${passed}/${total} tests passed`,
      allPassed: passed === total,
      results,
    });
  } catch (err: any) {
    res.status(500).json({
      error: "Test runner failed",
      message: err?.message ?? String(err),
      stack: err?.stack?.slice(0, 500),
    });
  }
});

export default router;
