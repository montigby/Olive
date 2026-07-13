import { db, personsTable, relationshipsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
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

// Would `personId` -- who must currently be an admin -- being demoted,
// deleted, or otherwise dropped out of the admin role leave `familyUnitId`
// with zero admins? This is the single source of truth for the "a family
// unit can never have zero admins" guarantee. Every code path that can flip
// isAdmin to false, delete an admin's person row, or unclaim an admin's
// person row (e.g. the cross-family account-merge flow) must call this
// before proceeding. See:
//   - PATCH /api/persons/:personId/admin (persons.ts)
//   - DELETE /api/persons/:personId (persons.ts)
//   - delete_family_member AI tool (ai.ts)
//   - POST /api/invites/:token/merge/confirm (invites.ts)
export async function isLastAdminInUnit(personId: string, familyUnitId: string): Promise<boolean> {
  const admins = await db
    .select({ id: personsTable.id })
    .from(personsTable)
    .where(and(eq(personsTable.familyUnitId, familyUnitId), eq(personsTable.isAdmin, true)));
  return admins.length <= 1 && admins.some((a) => a.id === personId);
}
