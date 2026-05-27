import { db, familyUnitsTable } from "@workspace/db";
import { eq, and, or } from "drizzle-orm";

/**
 * Returns true if two family units share an accepted direct link
 * (one is the other's parent with parentLinkStatus = 'accepted').
 * Returns true if the IDs are the same unit.
 *
 * Note: only checks direct adjacency. Transitive links (A→B→C) are not
 * considered linked here — that's the policy applied across /members,
 * /family-units/:unitId, /persons/:personId, and /birthdays.
 */
export async function areUnitsLinked(
  unitAId: string,
  unitBId: string,
): Promise<boolean> {
  if (unitAId === unitBId) return true;

  const rows = await db
    .select({ id: familyUnitsTable.id })
    .from(familyUnitsTable)
    .where(
      or(
        and(
          eq(familyUnitsTable.id, unitAId),
          eq(familyUnitsTable.parentUnitId, unitBId),
          eq(familyUnitsTable.parentLinkStatus, "accepted"),
        ),
        and(
          eq(familyUnitsTable.id, unitBId),
          eq(familyUnitsTable.parentUnitId, unitAId),
          eq(familyUnitsTable.parentLinkStatus, "accepted"),
        ),
      ),
    )
    .limit(1);

  return rows.length > 0;
}
