import { db, personsTable, relationshipsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isParentOf } from "./visibility";

export interface Viewer {
  personId: string;
  isAdmin: boolean;
  familyUnitId: string;
}

export interface EditTarget {
  id: string;
  familyUnitId: string;
}

// Is `viewerId` a parent of `targetPersonId` within `familyUnitId`? Fetches
// the family unit's members + relationships fresh -- callers already holding
// that data in a loop (e.g. ai.ts's tool-call loop) should call
// isParentOf from ./visibility directly instead to avoid refetching per call.
export async function isParentOfPerson(
  viewerId: string,
  targetPersonId: string,
  familyUnitId: string,
): Promise<boolean> {
  const allMembers = await db
    .select()
    .from(personsTable)
    .where(eq(personsTable.familyUnitId, familyUnitId));

  const relationships = await db
    .select({
      fromPerson: relationshipsTable.fromPerson,
      toPerson: relationshipsTable.toPerson,
      type: relationshipsTable.type,
    })
    .from(relationshipsTable)
    .where(eq(relationshipsTable.familyId, familyUnitId));

  return isParentOf(viewerId, targetPersonId, allMembers, relationships);
}

// Self, same-family admin, or parent of the target (per the family graph)
// can edit a profile.
export async function canEditPerson(viewer: Viewer, target: EditTarget): Promise<boolean> {
  if (viewer.personId === target.id) return true;
  if (viewer.familyUnitId !== target.familyUnitId) return false;
  if (viewer.isAdmin) return true;
  return isParentOfPerson(viewer.personId, target.id, target.familyUnitId);
}
