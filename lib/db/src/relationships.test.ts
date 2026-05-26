/**
 * Relationships data-layer tests.
 *
 * Each test creates its own unique familyId so test data is fully isolated.
 * All inserted rows are cleaned up in afterEach so re-runs stay idempotent.
 *
 * Requires DATABASE_URL to point at a local (or safe dev) Postgres instance
 * that already has the people + relationships tables (0007_relationships.sql).
 */

import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "./index.js";
import {
  addPerson,
  addRelationship,
  getCurrentSpouse,
  getSiblings,
  peopleTable,
  relationshipsTable,
} from "./relationships.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a fresh family ID for each test. */
function newFamilyId(): string {
  return crypto.randomUUID();
}

/**
 * Wipe all people (and their cascaded relationships) for a given familyId.
 * Called in afterEach so each test starts with a clean slate.
 */
async function cleanFamily(familyId: string) {
  await db.delete(peopleTable).where(eq(peopleTable.familyId, familyId));
}

/** Read all relationship rows for a person (from_person direction). */
async function relationsFrom(personId: string) {
  return db
    .select()
    .from(relationshipsTable)
    .where(eq(relationshipsTable.fromPerson, personId));
}

// ---------------------------------------------------------------------------
// Test state (cleaned in afterEach)
// ---------------------------------------------------------------------------
const usedFamilyIds: string[] = [];

beforeEach(() => {
  // nothing — families are created inside each test
});

afterEach(async () => {
  for (const fid of usedFamilyIds) {
    await cleanFamily(fid);
  }
  usedFamilyIds.length = 0;
});

function fam(): string {
  const id = newFamilyId();
  usedFamilyIds.push(id);
  return id;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("addPerson / relationships", () => {
  // 1. The Trevor case -------------------------------------------------------
  it("adds an unmarried person with no spurious relationships (Trevor case)", async () => {
    const familyId = fam();

    const mom = await addPerson(db, familyId, { firstName: "Mom", lastName: "Test" });
    const dad = await addPerson(db, familyId, { firstName: "Dad", lastName: "Test" });

    // Sibling — already has biological_parent edges
    const tanner = await addPerson(db, familyId, { firstName: "Tanner", lastName: "Test" }, [
      { relatedPersonId: mom.id, type: "biological_parent" },
      { relatedPersonId: dad.id, type: "biological_parent" },
    ]);

    // Trevor — added with ONLY parent edges, no spouse
    const trevor = await addPerson(db, familyId, { firstName: "Trevor", lastName: "Test" }, [
      { relatedPersonId: mom.id, type: "biological_parent" },
      { relatedPersonId: dad.id, type: "biological_parent" },
    ]);

    // Trevor has no spouse, partner, or ex_spouse
    const trevoRels = await relationsFrom(trevor.id);
    const spouseTypes = trevoRels.filter((r) =>
      ["spouse", "partner", "ex_spouse"].includes(r.type),
    );
    expect(spouseTypes).toHaveLength(0);

    // Trevor's stored relationships are only biological_parent edges (2: mom + dad)
    expect(trevoRels).toHaveLength(2);
    expect(trevoRels.every((r) => r.type === "biological_parent")).toBe(true);

    // Trevor's siblings are exactly the other children of those parents — no one else
    const siblings = await getSiblings(db, trevor.id);
    expect(siblings).toHaveLength(1);
    expect(siblings[0]).toBe(tanner.id);
  });

  // 2. Self-relationship rejected --------------------------------------------
  it("rejects a self-relationship", async () => {
    const familyId = fam();
    const alice = await addPerson(db, familyId, { firstName: "Alice" });

    await expect(
      addRelationship(db, familyId, alice.id, alice.id, "spouse"),
    ).rejects.toThrow("A person cannot be related to themselves.");
  });

  // 3. Cycle prevention ------------------------------------------------------
  it("prevents ancestor cycles", async () => {
    const familyId = fam();
    const a = await addPerson(db, familyId, { firstName: "A" });
    const b = await addPerson(db, familyId, { firstName: "B" });

    // A is a parent of B
    await addRelationship(db, familyId, a.id, b.id, "biological_parent");

    // Making B a parent of A would create a cycle
    await expect(
      addRelationship(db, familyId, b.id, a.id, "biological_parent"),
    ).rejects.toThrow("Cycle detected");
  });

  // 4. Symmetric spouse ------------------------------------------------------
  it("creates the reverse edge automatically for symmetric types", async () => {
    const familyId = fam();
    const alice = await addPerson(db, familyId, { firstName: "Alice" });
    const bob = await addPerson(db, familyId, { firstName: "Bob" });

    await addRelationship(db, familyId, alice.id, bob.id, "spouse");

    // A→B exists
    const fwd = await db
      .select()
      .from(relationshipsTable)
      .where(
        and(
          eq(relationshipsTable.fromPerson, alice.id),
          eq(relationshipsTable.toPerson, bob.id),
          eq(relationshipsTable.type, "spouse"),
        ),
      );
    expect(fwd).toHaveLength(1);

    // B→A also exists (symmetric)
    const rev = await db
      .select()
      .from(relationshipsTable)
      .where(
        and(
          eq(relationshipsTable.fromPerson, bob.id),
          eq(relationshipsTable.toPerson, alice.id),
          eq(relationshipsTable.type, "spouse"),
        ),
      );
    expect(rev).toHaveLength(1);
  });

  // 5. Current spouse uniqueness ---------------------------------------------
  it("demotes old spouse edge to ex_spouse when a new spouse is added", async () => {
    const familyId = fam();
    const alice = await addPerson(db, familyId, { firstName: "Alice" });
    const bob = await addPerson(db, familyId, { firstName: "Bob" });
    const carol = await addPerson(db, familyId, { firstName: "Carol" });

    // Alice marries Bob
    await addRelationship(db, familyId, alice.id, bob.id, "spouse");

    // Verify Bob is Alice's current spouse
    expect(await getCurrentSpouse(db, alice.id)).toBe(bob.id);

    // Alice now marries Carol — Bob should be demoted to ex_spouse
    await addRelationship(db, familyId, alice.id, carol.id, "spouse");

    // No current spouse edge from Alice to Bob
    const aliceBobSpouse = await db
      .select()
      .from(relationshipsTable)
      .where(
        and(
          eq(relationshipsTable.fromPerson, alice.id),
          eq(relationshipsTable.toPerson, bob.id),
          eq(relationshipsTable.type, "spouse"),
        ),
      );
    expect(aliceBobSpouse).toHaveLength(0);

    // An ex_spouse edge now exists from Alice to Bob with an end_date
    const aliceBobEx = await db
      .select()
      .from(relationshipsTable)
      .where(
        and(
          eq(relationshipsTable.fromPerson, alice.id),
          eq(relationshipsTable.toPerson, bob.id),
          eq(relationshipsTable.type, "ex_spouse"),
        ),
      );
    expect(aliceBobEx).toHaveLength(1);
    expect(aliceBobEx[0]?.endDate).not.toBeNull();

    // Alice's current spouse is now Carol
    expect(await getCurrentSpouse(db, alice.id)).toBe(carol.id);
  });

  // 6. In-laws are not auto-created ------------------------------------------
  it("does not create in-law relationships automatically", async () => {
    const familyId = fam();
    const alice = await addPerson(db, familyId, { firstName: "Alice" });
    const bob = await addPerson(db, familyId, { firstName: "Bob" });
    const bobSibling = await addPerson(db, familyId, { firstName: "BobSibling" });
    const sharedParent = await addPerson(db, familyId, { firstName: "BobsParent" });

    // Bob and his sibling share a parent
    await addRelationship(db, familyId, sharedParent.id, bob.id, "biological_parent");
    await addRelationship(db, familyId, sharedParent.id, bobSibling.id, "biological_parent");

    // Alice marries Bob
    await addRelationship(db, familyId, alice.id, bob.id, "spouse");

    // Alice has NO stored relationship to Bob's sibling — the UI derives this
    const aliceToSibling = await db
      .select()
      .from(relationshipsTable)
      .where(
        and(
          eq(relationshipsTable.fromPerson, alice.id),
          eq(relationshipsTable.toPerson, bobSibling.id),
        ),
      );
    expect(aliceToSibling).toHaveLength(0);

    // And the reverse
    const siblingToAlice = await db
      .select()
      .from(relationshipsTable)
      .where(
        and(
          eq(relationshipsTable.fromPerson, bobSibling.id),
          eq(relationshipsTable.toPerson, alice.id),
        ),
      );
    expect(siblingToAlice).toHaveLength(0);
  });
});
