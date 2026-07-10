import { Router } from "express";
import { db } from "@workspace/db";
import { personsTable, accountsTable, relationshipsTable, peopleTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { UpdatePersonBody } from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { formatPerson } from "./auth";
import { computeTier, applyVisibility } from "../lib/visibility";
import { areUnitsLinked } from "../lib/unitAccess";
import { buildPersonUpdateData } from "../lib/personUpdate";

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

  res.json(filtered);
});

// PATCH /api/persons/:personId
router.patch("/persons/:personId", requireAuth, async (req, res) => {
  const personId = String(req.params.personId);

  // Look up target to verify same-family admin permission.
  const [target] = await db
    .select({ id: personsTable.id, familyUnitId: personsTable.familyUnitId })
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
    res.status(403).json({ error: "Forbidden", message: "Cannot edit another person's profile" });
    return;
  }

  const parsed = UpdatePersonBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation error", message: parsed.error.message });
    return;
  }

  const data = parsed.data;
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
    const admins = await db
      .select({ id: personsTable.id })
      .from(personsTable)
      .where(and(eq(personsTable.familyUnitId, target.familyUnitId), eq(personsTable.isAdmin, true)));
    if (admins.length <= 1) {
      res.status(409).json({ error: "Conflict", message: "Cannot remove the last admin in a family." });
      return;
    }
  }

  const [updated] = await db
    .update(personsTable)
    .set({ isAdmin, updatedAt: new Date() })
    .where(eq(personsTable.id, personId))
    .returning();

  res.json(formatPerson(updated));
});

// DELETE /api/persons/:personId
router.delete("/persons/:personId", requireAuth, async (req, res) => {
  const personId = String(req.params.personId);

  // Look up target to verify same-family admin permission.
  const [target] = await db
    .select({ id: personsTable.id, familyUnitId: personsTable.familyUnitId })
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

  await db.delete(accountsTable).where(eq(accountsTable.personId, personId));
  await db.delete(personsTable).where(eq(personsTable.id, personId));

  res.json({ message: "Person deleted" });
});

export default router;
