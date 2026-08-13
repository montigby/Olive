import { Router } from "express";
import { db } from "@workspace/db";
import { personsTable, accountsTable, relationshipsTable, peopleTable, lifeEventsTable, familyUnitsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { UpdatePersonBody } from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { formatPerson } from "./auth";
import { computeTier, applyVisibility, describeRelationship } from "../lib/visibility";
import { areUnitsLinked } from "../lib/unitAccess";
import { buildPersonUpdateData, isValidPhotoUrl } from "../lib/personUpdate";
import { canEditPerson, isLastAdminInUnit } from "../lib/permissions";
import { computeProfileCompleteness } from "../lib/profileCompleteness";

const router = Router();

// GET /api/persons/:personId
router.get("/persons/:personId", requireAuth, async (req, res) => {
  const personId = String(req.params.personId);
  const persons = await db
    .select()
    .from(personsTable)
    .where(eq(personsTable.id, personId))
    .limit(1);

  if (!persons.length) {
    res.status(404).json({ error: "Not found", message: "Person not found" });
    return;
  }

  const target = persons[0];

  // Load the viewer's person record
  const viewers = await db
    .select()
    .from(personsTable)
    .where(eq(personsTable.id, req.auth!.personId))
    .limit(1);

  if (!viewers.length) {
    res.status(401).json({ error: "Unauthorized", message: "Viewer not found" });
    return;
  }

  const viewer = viewers[0];

  // Cross-unit access: require an accepted parent-link in either direction.
  // Without this gate, anyone could fetch any personId and get tier 1-2 data
  // (including birthday) for admins/close-family in unlinked families.
  if (
    viewer.familyUnitId !== target.familyUnitId &&
    !(await areUnitsLinked(viewer.familyUnitId, target.familyUnitId))
  ) {
    res.status(403).json({ error: "Forbidden", message: "Profile not visible" });
    return;
  }

  // computeTier uses allMembers + relationships only when viewer and target
  // are in the same unit (it builds the family graph there); for cross-unit
  // it ignores both and falls back to label-based tiering.
  const allMembers = await db
    .select()
    .from(personsTable)
    .where(eq(personsTable.familyUnitId, target.familyUnitId));

  const relationships = await db
    .select({
      fromPerson: relationshipsTable.fromPerson,
      toPerson: relationshipsTable.toPerson,
      type: relationshipsTable.type,
    })
    .from(relationshipsTable)
    .where(eq(relationshipsTable.familyId, target.familyUnitId));

  const tier = computeTier(viewer, target, allMembers, relationships);
  const formatted = formatPerson(target);
  const filtered = applyVisibility(formatted, tier);

  if (!filtered) {
    res.status(403).json({ error: "Forbidden", message: "Profile not visible" });
    return;
  }

  // Viewer-relative relationship label (e.g. "Sibling", "Parent", "Me")
  // instead of the static relationshipLabel column, which is frozen to
  // whoever the admin was when the person was added. Only computed
  // same-unit -- describeRelationship's graph is built from `allMembers`,
  // which is the target's unit, so it can't place a cross-unit viewer.
  // Cross-unit viewers fall back to the static label on the frontend.
  const result: typeof filtered & {
    viewerRelationshipLabel?: string;
    profileCompleteness?: number;
    missingPriorityField?: string | null;
  } = filtered;
  if (viewer.familyUnitId === target.familyUnitId) {
    result.viewerRelationshipLabel = describeRelationship(viewer.id, target.id, allMembers, relationships);
  }

  // Data-quality signal for admins looking at someone else's profile, same
  // audience restriction as the members-list version.
  if (viewer.isAdmin && viewer.familyUnitId === target.familyUnitId) {
    Object.assign(result, computeProfileCompleteness(target));
  }

  res.json(result);
});

// PATCH /api/persons/:personId
router.patch("/persons/:personId", requireAuth, async (req, res) => {
  const personId = String(req.params.personId);

  // Look up target to verify same-family admin permission.
  const [target] = await db
    .select({ id: personsTable.id, familyUnitId: personsTable.familyUnitId, deceased: personsTable.deceased })
    .from(personsTable)
    .where(eq(personsTable.id, personId))
    .limit(1);

  if (!target) {
    res.status(404).json({ error: "Not found", message: "Person not found" });
    return;
  }

  if (!(await canEditPerson(req.auth!, target))) {
    res.status(403).json({ error: "Forbidden", message: "Cannot edit another person's profile" });
    return;
  }

  const parsed = UpdatePersonBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation error", message: parsed.error.message });
    return;
  }

  const data = parsed.data;
  if (!isValidPhotoUrl(data.photoUrl)) {
    res.status(400).json({ error: "Validation error", message: "photoUrl must be a data: image URL" });
    return;
  }

  const updateData = buildPersonUpdateData(data as any, { allowRelationshipLabel: req.auth!.isAdmin });

  const updated = await db
    .update(personsTable)
    .set(updateData)
    .where(eq(personsTable.id, personId))
    .returning();

  if (!updated.length) {
    res.status(404).json({ error: "Not found", message: "Person not found" });
    return;
  }

  if (updateData.firstName !== undefined || updateData.lastName !== undefined) {
    const nameSync: Partial<typeof peopleTable.$inferInsert> = {};
    if (updateData.firstName !== undefined) nameSync.firstName = updateData.firstName;
    if (updateData.lastName !== undefined) nameSync.lastName = updateData.lastName;
    await db.update(peopleTable).set(nameSync).where(eq(peopleTable.id, personId)).catch(() => {});
  }

  // First transition to deceased -- auto-log it as a life event alongside
  // everything else on the person's timeline. Best-effort: never block the
  // primary profile update on this.
  if (updateData.deceased === true && !target.deceased) {
    await db
      .insert(lifeEventsTable)
      .values({
        familyId: target.familyUnitId,
        personId,
        eventType: "death",
        eventDate: updated[0].dateOfPassing ?? new Date().toISOString().slice(0, 10),
        createdBy: req.auth!.personId,
      })
      .catch(() => {});
  }

  res.json(formatPerson(updated[0]));
});

// PATCH /api/persons/:personId/admin
// Grants or revokes admin status for an existing (claimed) family member.
// Admin-only, same family unit. Refuses to remove the last remaining admin
// so a family unit can never be left without one.
router.patch("/persons/:personId/admin", requireAuth, requireAdmin, async (req, res) => {
  const personId = String(req.params.personId);
  const { isAdmin } = req.body as { isAdmin?: boolean };

  if (typeof isAdmin !== "boolean") {
    res.status(400).json({ error: "Validation error", message: "isAdmin must be a boolean" });
    return;
  }

  const [target] = await db
    .select({
      id: personsTable.id,
      familyUnitId: personsTable.familyUnitId,
      isAdmin: personsTable.isAdmin,
      claimed: personsTable.claimed,
    })
    .from(personsTable)
    .where(eq(personsTable.id, personId))
    .limit(1);

  if (!target) {
    res.status(404).json({ error: "Not found", message: "Person not found" });
    return;
  }

  if (target.familyUnitId !== req.auth!.familyUnitId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (!target.claimed) {
    res.status(400).json({ error: "Bad request", message: "Only a claimed profile with an account can be an admin." });
    return;
  }

  if (!isAdmin && target.isAdmin) {
    if (await isLastAdminInUnit(target.id, target.familyUnitId)) {
      res.status(409).json({ error: "Conflict", message: "Cannot remove the last admin in a family." });
      return;
    }
  }

  // Deliberately not touching updatedAt -- it drives the "Recent updates"
  // home feed, which infers what changed from current field values. Admin
  // status isn't a profile field, so bumping it would make someone jump to
  // the top of that feed with a fabricated, unrelated description.
  const [updated] = await db
    .update(personsTable)
    .set({ isAdmin })
    .where(eq(personsTable.id, personId))
    .returning();

  res.json(formatPerson(updated));
});

// DELETE /api/persons/:personId
router.delete("/persons/:personId", requireAuth, async (req, res) => {
  const personId = String(req.params.personId);

  // Look up target to verify same-family admin permission.
  const [target] = await db
    .select({ id: personsTable.id, familyUnitId: personsTable.familyUnitId, isAdmin: personsTable.isAdmin })
    .from(personsTable)
    .where(eq(personsTable.id, personId))
    .limit(1);

  if (!target) {
    res.status(404).json({ error: "Not found", message: "Person not found" });
    return;
  }

  const isSelf = req.auth!.personId === personId;
  const isSameFamilyAdmin =
    req.auth!.isAdmin && req.auth!.familyUnitId === target.familyUnitId;

  if (!isSelf && !isSameFamilyAdmin) {
    res.status(403).json({ error: "Forbidden", message: "Cannot remove another person" });
    return;
  }

  // Deleting a person removes their row entirely -- if they're the last
  // admin, this would leave the family unit with zero admins, same as
  // demoting them via the PATCH endpoint above. Applies even to self-delete.
  // Exception: if they're the *only* person left in the unit at all, there's
  // no one left to orphan -- deleting them removes the whole (now-empty)
  // unit below instead of leaving a leaderless family behind.
  const otherMembers = await db
    .select({ id: personsTable.id })
    .from(personsTable)
    .where(eq(personsTable.familyUnitId, target.familyUnitId))
    .limit(2);
  const isSoleMember = otherMembers.length === 1 && otherMembers[0].id === target.id;

  if (target.isAdmin && !isSoleMember && (await isLastAdminInUnit(target.id, target.familyUnitId))) {
    res.status(409).json({
      error: "Conflict",
      message: "Cannot remove the last admin in a family. Grant admin access to someone else first.",
    });
    return;
  }

  // Best-effort cleanup of the supplementary relationship-graph layer --
  // people/relationships share persons' UUIDs by convention only, not by FK,
  // so nothing else will remove these rows once the person is gone.
  await db
    .delete(relationshipsTable)
    .where(or(eq(relationshipsTable.fromPerson, personId), eq(relationshipsTable.toPerson, personId)))
    .catch(() => {});
  await db.delete(peopleTable).where(eq(peopleTable.id, personId)).catch(() => {});

  await db.delete(accountsTable).where(eq(accountsTable.personId, personId));

  try {
    await db.delete(personsTable).where(eq(personsTable.id, personId));
  } catch (err: any) {
    // unit_link_requests.connectorPersonId/requestedBy reference persons with
    // ON DELETE RESTRICT (unlike everything else here, which cascades) -- a
    // person who initiated or is the connector on a still-pending cross-family
    // link request can't be deleted until that request is resolved.
    if (err?.code === "23503") {
      res.status(409).json({
        error: "Conflict",
        message:
          "Can't delete this profile while it's tied to a pending cross-family connection request. Resolve that request first, then try again.",
      });
      return;
    }
    throw err;
  }

  // If that was the last person in the family unit, the unit is now an empty
  // orphan -- persons.familyUnitId cascades away everything that points at
  // the unit, but nothing removes an emptied-out unit itself. This can only
  // happen when the deleted person was the unit's sole admin, since the
  // "never zero admins" invariant guarantees any unit with >=1 person has
  // >=1 admin -- so this never fires while other people's data is at stake.
  const [remaining] = await db
    .select({ id: personsTable.id })
    .from(personsTable)
    .where(eq(personsTable.familyUnitId, target.familyUnitId))
    .limit(1);

  if (!remaining) {
    await db
      .delete(familyUnitsTable)
      .where(eq(familyUnitsTable.id, target.familyUnitId))
      .catch((err: any) => {
        console.error("[persons.delete] failed to clean up empty family unit:", err?.message ?? err);
      });
  }

  res.json({ message: "Person deleted" });
});

export default router;
