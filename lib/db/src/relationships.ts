/**
 * Explicit-edge relationship system.
 *
 * Every connection between people is stored as a typed row in the `relationships`
 * table. Nothing is inferred from tree position — if it isn't in the table, it
 * doesn't exist.
 *
 * Adapted from the Supabase-client spec to use Drizzle ORM.
 */

import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { peopleTable } from "./schema/people";
import { relationshipsTable } from "./schema/relationships";

// Re-export schema tables for callers that want direct access
export { peopleTable, relationshipsTable };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RelType =
  | "biological_parent"
  | "adoptive_parent"
  | "step_parent"
  | "spouse"
  | "ex_spouse"
  | "partner";

export const SYMMETRIC_TYPES: RelType[] = ["spouse", "ex_spouse", "partner"];
export const PARENT_TYPES: RelType[] = [
  "biological_parent",
  "adoptive_parent",
  "step_parent",
];

export interface NewPerson {
  firstName: string;
  lastName?: string;
  birthDate?: string;
  deathDate?: string;
  gender?: string;
}

export interface Connection {
  relatedPersonId: string;
  type: RelType;
  startDate?: string;
}

// Use a generic DB type so the module works with any Drizzle schema combination.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = NodePgDatabase<any>;

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

/**
 * Add a person with ONLY the relationships explicitly provided.
 * Does NOT infer any connections from tree position.
 */
export async function addPerson(
  db: DB,
  familyId: string,
  person: NewPerson,
  connections: Connection[] = [],
) {
  const [newPerson] = await db
    .insert(peopleTable)
    .values({
      familyId,
      firstName: person.firstName,
      lastName: person.lastName,
      birthDate: person.birthDate,
      deathDate: person.deathDate,
      gender: person.gender,
    })
    .returning();

  if (!newPerson) throw new Error("Insert returned no rows.");

  for (const c of connections) {
    await addRelationship(
      db,
      familyId,
      newPerson.id,
      c.relatedPersonId,
      c.type,
      c.startDate,
    );
  }

  return newPerson;
}

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

/**
 * Add a single relationship. Handles direction, symmetry, cycle prevention,
 * and current-spouse uniqueness.
 */
export async function addRelationship(
  db: DB,
  familyId: string,
  personA: string,
  personB: string,
  type: RelType,
  startDate?: string,
) {
  if (personA === personB) {
    throw new Error("A person cannot be related to themselves.");
  }

  // Prevent ancestor cycles for parent-type edges.
  // We're about to store (personA → personB) meaning "personA's parent is personB".
  // A cycle would form if personA is already an ancestor of personB
  // (i.e. personB is already a descendant of personA in the current tree).
  // Equivalently: personA must NOT appear in the ancestor set of personB.
  if (PARENT_TYPES.includes(type)) {
    const ancestorsOfB = await getAncestors(db, personB);
    if (ancestorsOfB.has(personA)) {
      throw new Error(
        "Cycle detected: this would make a person their own ancestor.",
      );
    }
  }

  // Current spouse uniqueness: retire any existing 'spouse' edges for either
  // person before inserting the new one. Delete rather than UPDATE to avoid
  // unique-constraint conflicts when an ex_spouse edge already exists.
  if (type === "spouse") {
    const today = new Date().toISOString().slice(0, 10);

    const oldEdges = await db
      .select()
      .from(relationshipsTable)
      .where(
        and(
          eq(relationshipsTable.familyId, familyId),
          inArray(relationshipsTable.fromPerson, [personA, personB]),
          eq(relationshipsTable.type, "spouse"),
        ),
      );

    for (const edge of oldEdges) {
      await db
        .delete(relationshipsTable)
        .where(eq(relationshipsTable.id, edge.id));

      // Insert ex_spouse version (skip if duplicate already exists)
      await db
        .insert(relationshipsTable)
        .values({
          familyId: edge.familyId,
          fromPerson: edge.fromPerson,
          toPerson: edge.toPerson,
          type: "ex_spouse",
          startDate: edge.startDate ?? undefined,
          endDate: today,
        })
        .onConflictDoNothing();
    }
  }

  await db.insert(relationshipsTable).values({
    familyId,
    fromPerson: personA,
    toPerson: personB,
    type,
    startDate,
  });

  if (SYMMETRIC_TYPES.includes(type)) {
    await db.insert(relationshipsTable).values({
      familyId,
      fromPerson: personB,
      toPerson: personA,
      type,
      startDate,
    });
  }
}

/** Remove a relationship (and its symmetric pair if applicable). */
export async function removeRelationship(
  db: DB,
  personA: string,
  personB: string,
  type: RelType,
) {
  await db
    .delete(relationshipsTable)
    .where(
      and(
        eq(relationshipsTable.fromPerson, personA),
        eq(relationshipsTable.toPerson, personB),
        eq(relationshipsTable.type, type),
      ),
    );

  if (SYMMETRIC_TYPES.includes(type)) {
    await db
      .delete(relationshipsTable)
      .where(
        and(
          eq(relationshipsTable.fromPerson, personB),
          eq(relationshipsTable.toPerson, personA),
          eq(relationshipsTable.type, type),
        ),
      );
  }
}

// ---------------------------------------------------------------------------
// Graph traversal helpers
// ---------------------------------------------------------------------------

/**
 * Get all ancestors of a person (transitive parents).
 *
 * Edge direction: from_person = child, to_person = parent.
 * To climb the tree we follow from_person → to_person.
 */
export async function getAncestors(
  db: DB,
  personId: string,
): Promise<Set<string>> {
  const ancestors = new Set<string>();
  const queue = [personId];

  while (queue.length) {
    const current = queue.shift()!;
    // current is the child; its parents are in the to_person column
    const rows = await db
      .select({ toPerson: relationshipsTable.toPerson })
      .from(relationshipsTable)
      .where(
        and(
          eq(relationshipsTable.fromPerson, current),
          inArray(relationshipsTable.type, PARENT_TYPES),
        ),
      );

    for (const row of rows) {
      if (!ancestors.has(row.toPerson)) {
        ancestors.add(row.toPerson);
        queue.push(row.toPerson);
      }
    }
  }

  return ancestors;
}

/** Direct parents only. */
export async function getParents(
  db: DB,
  personId: string,
): Promise<string[]> {
  // personId is the child (from_person); parents are in to_person
  const rows = await db
    .select({ toPerson: relationshipsTable.toPerson })
    .from(relationshipsTable)
    .where(
      and(
        eq(relationshipsTable.fromPerson, personId),
        inArray(relationshipsTable.type, PARENT_TYPES),
      ),
    );
  return rows.map((r) => r.toPerson);
}

/** Direct children only. */
export async function getChildren(
  db: DB,
  personId: string,
): Promise<string[]> {
  // personId is the parent (to_person); children are in from_person
  const rows = await db
    .select({ fromPerson: relationshipsTable.fromPerson })
    .from(relationshipsTable)
    .where(
      and(
        eq(relationshipsTable.toPerson, personId),
        inArray(relationshipsTable.type, PARENT_TYPES),
      ),
    );
  return rows.map((r) => r.fromPerson);
}

/** Siblings — people sharing at least one parent. Derived, never stored. */
export async function getSiblings(
  db: DB,
  personId: string,
): Promise<string[]> {
  const parentIds = await getParents(db, personId);
  if (!parentIds.length) return [];

  // Find all children of those parents (edges where to_person ∈ parentIds)
  const rows = await db
    .select({ fromPerson: relationshipsTable.fromPerson })
    .from(relationshipsTable)
    .where(
      and(
        inArray(relationshipsTable.toPerson, parentIds),
        inArray(relationshipsTable.type, PARENT_TYPES),
      ),
    );

  const ids = new Set(rows.map((r) => r.fromPerson));
  ids.delete(personId);
  return [...ids];
}

/** Current spouse, if any. */
export async function getCurrentSpouse(
  db: DB,
  personId: string,
): Promise<string | null> {
  const rows = await db
    .select({ toPerson: relationshipsTable.toPerson })
    .from(relationshipsTable)
    .where(
      and(
        eq(relationshipsTable.fromPerson, personId),
        eq(relationshipsTable.type, "spouse"),
      ),
    )
    .limit(1);

  return rows[0]?.toPerson ?? null;
}
