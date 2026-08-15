/**
 * Syncs a person from personsTable into the explicit relationship layer
 * (peopleTable + relationshipsTable). Call this after every personsTable insert.
 *
 * Rules:
 *  - The person's UUID is shared across both tables.
 *  - We lazy-ensure both sides of each edge exist in peopleTable before inserting
 *    the edge, so FK constraints can't fail.
 *  - Errors are caught and logged rather than propagated — relationship sync is
 *    best-effort and must never break the primary insert.
 */

import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { personsTable, peopleTable } from "@workspace/db";
import { addRelationship } from "@workspace/db/relationships";

const GRANDPARENT_LABEL_FRAGMENTS = [
  "grandmother",
  "grandfather",
  "grandma",
  "grandpa",
  "nana",
  "papa",
  "granny",
  "gramps",
];

/** Look up a person's currently-stored relationshipLabel, e.g. to disambiguate a reused label. */
async function getStoredLabel(personId: string): Promise<string | null> {
  const rows = await db
    .select({ relationshipLabel: personsTable.relationshipLabel })
    .from(personsTable)
    .where(eq(personsTable.id, personId))
    .limit(1);
  return rows[0]?.relationshipLabel?.toLowerCase() ?? null;
}

/** Ensure a person exists in the people table, pulling their name from persons. */
async function ensureInPeopleTable(personId: string, familyId: string) {
  // Fast-path: already there
  const existing = await db
    .select({ id: peopleTable.id })
    .from(peopleTable)
    .where(eq(peopleTable.id, personId))
    .limit(1);
  if (existing.length) return;

  // Look up name in persons
  const rows = await db
    .select({ firstName: personsTable.firstName, lastName: personsTable.lastName })
    .from(personsTable)
    .where(eq(personsTable.id, personId))
    .limit(1);
  if (!rows[0]) return;

  await db
    .insert(peopleTable)
    .values({ id: personId, familyId, firstName: rows[0].firstName, lastName: rows[0].lastName ?? undefined })
    .onConflictDoNothing();
}

/**
 * Main entry point — call after inserting a new person into personsTable.
 *
 * @param personId     UUID of the newly inserted person (same as persons.id)
 * @param familyId     familyUnitId
 * @param firstName    person's first name
 * @param lastName     person's last name (optional)
 * @param label        relationshipLabel (e.g. "sister-in-law")
 * @param adminId      the family admin's personId (persons.id)
 * @param parentPersonId  optional parentPersonId from the insert
 */
export async function syncPersonToRelationshipLayer(params: {
  personId: string;
  familyId: string;
  firstName: string;
  lastName?: string | null;
  label: string;
  adminId: string;
  parentPersonId?: string | null;
}) {
  const { personId, familyId, firstName, lastName, label, adminId, parentPersonId } = params;
  const l = label.toLowerCase().trim();

  try {
    // 1. Ensure the new person is in peopleTable
    await db
      .insert(peopleTable)
      .values({ id: personId, familyId, firstName, lastName: lastName ?? undefined })
      .onConflictDoNothing();

    // 2. Ensure admin is in peopleTable (may not be there if they pre-date this feature)
    await ensureInPeopleTable(adminId, familyId);

    // 3. Create the relationship edge based on label semantics
    //    Edge direction: (from_person = child, to_person = parent) for parent types.
    //    Spouse types are symmetric.

    if (["wife", "husband", "spouse", "partner"].includes(l)) {
      // New person is admin's spouse
      await addRelationship(db, familyId, personId, adminId, "spouse");

    } else if (["mom", "mother", "dad", "father"].includes(l)) {
      // New person is admin's parent → admin is child, new person is parent
      await addRelationship(db, familyId, adminId, personId, "biological_parent");

    } else if (["stepmother", "stepfather", "stepmom", "stepdad"].includes(l)) {
      // New person is admin's step-parent → same direction as mom/dad, but
      // a step_parent edge type instead of biological_parent.
      await addRelationship(db, familyId, adminId, personId, "step_parent");

    } else if (["son", "daughter", "child"].includes(l)) {
      // New person is admin's child → new person is child, admin is parent
      await addRelationship(db, familyId, personId, adminId, "biological_parent");

    } else if (["stepson", "stepdaughter"].includes(l)) {
      // New person is admin's step-child → same direction as son/daughter,
      // but a step_parent edge type instead of biological_parent.
      await addRelationship(db, familyId, personId, adminId, "step_parent");

    } else if (["brother-in-law", "sister-in-law"].includes(l) && parentPersonId) {
      // Sibling's spouse — parentPersonId is the sibling
      await ensureInPeopleTable(parentPersonId, familyId);
      await addRelationship(db, familyId, personId, parentPersonId, "spouse");

    } else if (["nephew", "niece"].includes(l) && parentPersonId) {
      // Sibling's child — parentPersonId is the sibling (their parent)
      await ensureInPeopleTable(parentPersonId, familyId);
      await addRelationship(db, familyId, personId, parentPersonId, "biological_parent");

    } else if (["grandson", "granddaughter", "grandchild"].includes(l) && parentPersonId) {
      // Admin's grandchild — parentPersonId is the child (their parent)
      await ensureInPeopleTable(parentPersonId, familyId);
      await addRelationship(db, familyId, personId, parentPersonId, "biological_parent");

    } else if (["great-grandson", "great-granddaughter", "great-grandchild"].includes(l) && parentPersonId) {
      // Admin's great-grandchild — parentPersonId is a grandchild (their parent)
      await ensureInPeopleTable(parentPersonId, familyId);
      await addRelationship(db, familyId, personId, parentPersonId, "biological_parent");

    } else if (l === "cousin" && parentPersonId) {
      // Cousin — parentPersonId is an aunt/uncle (their parent)
      await ensureInPeopleTable(parentPersonId, familyId);
      await addRelationship(db, familyId, personId, parentPersonId, "biological_parent");

    } else if (["mother-in-law", "father-in-law"].includes(l) && parentPersonId) {
      // Spouse's parent — reversed direction from every other picker case:
      // parentPersonId (the spouse) is the CHILD here, the new person is the PARENT.
      await ensureInPeopleTable(parentPersonId, familyId);
      await addRelationship(db, familyId, parentPersonId, personId, "biological_parent");

    } else if (["grandmother", "grandfather"].includes(l) && parentPersonId) {
      // AI chat only (no UI picker yet): "my mom's parents" — parentPersonId
      // (the parent) is the CHILD here, the new person is the PARENT.
      await ensureInPeopleTable(parentPersonId, familyId);
      await addRelationship(db, familyId, parentPersonId, personId, "biological_parent");

    } else if (["great-grandmother", "great-grandfather"].includes(l) && parentPersonId) {
      // AI chat only: "my grandma's mom" — parentPersonId (the grandparent)
      // is the CHILD here, the new person is the PARENT.
      await ensureInPeopleTable(parentPersonId, familyId);
      await addRelationship(db, familyId, parentPersonId, personId, "biological_parent");

    } else if (["nephew-in-law", "niece-in-law"].includes(l) && parentPersonId) {
      // AI chat only: spouse of an existing nephew/niece — parentPersonId is that nephew/niece.
      await ensureInPeopleTable(parentPersonId, familyId);
      await addRelationship(db, familyId, personId, parentPersonId, "spouse");

    } else if (l === "cousin-in-law" && parentPersonId) {
      // AI chat only: spouse of an existing cousin — parentPersonId is that cousin.
      await ensureInPeopleTable(parentPersonId, familyId);
      await addRelationship(db, familyId, personId, parentPersonId, "spouse");

    } else if (["uncle", "aunt"].includes(l) && parentPersonId) {
      // "Uncle"/"aunt" is genuinely ambiguous by label alone — the AI prompt reuses
      // it for two different roles: (a) a grandparent's child (parentPersonId =
      // the grandparent, new person is their CHILD), and (b) the spouse of an
      // already-added uncle/aunt (parentPersonId = that uncle/aunt, new person
      // is their SPOUSE). Disambiguate by checking what parentPersonId's own
      // stored label actually is.
      await ensureInPeopleTable(parentPersonId, familyId);
      const referencedLabel = await getStoredLabel(parentPersonId);
      const referencesGrandparent =
        !!referencedLabel && GRANDPARENT_LABEL_FRAGMENTS.some((f) => referencedLabel.includes(f));
      if (referencesGrandparent) {
        await addRelationship(db, familyId, personId, parentPersonId, "biological_parent");
      } else {
        await addRelationship(db, familyId, personId, parentPersonId, "spouse");
      }
    }
    // brothers, sisters, half-siblings, step-siblings, and grandparents/
    // great-grandparents added without a parentPersonId → no edge possible
    // without shared-parent info. These continue to rely on label-based
    // layout heuristics (see PARENT_OF_ADMIN/CHILD_OF_ADMIN/SIBLING_OF_ADMIN
    // in visibility.ts).

  } catch (err: any) {
    // Never let sync failure break the primary insert path
    console.error("[syncRelationship] failed:", err?.message ?? err);
  }
}
