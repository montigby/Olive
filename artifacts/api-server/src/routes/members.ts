import { Router } from "express";
import { nanoid } from "nanoid";
import { db } from "@workspace/db";
import { personsTable, relationshipsTable } from "@workspace/db";
import { eq, and, ilike } from "drizzle-orm";
import { AddMemberBody } from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { formatPerson } from "./auth";
import { computeVisibleSet, computeTier, applyVisibility, describeRelationship } from "../lib/visibility";
import { areUnitsLinked } from "../lib/unitAccess";
import { syncPersonToRelationshipLayer } from "../lib/syncRelationship";
import { isWithinFieldLengthLimits } from "../lib/personUpdate";

const router = Router();

// GET /api/family-units/:unitId/members
router.get("/family-units/:unitId/members", requireAuth, async (req, res) => {
  const unitId = String(req.params.unitId);
  const members = await db
    .select()
    .from(personsTable)
    .where(eq(personsTable.familyUnitId, unitId));

  // Load viewer's person record
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
  if (viewer.familyUnitId !== unitId) {
    if (!(await areUnitsLinked(viewer.familyUnitId, unitId))) {
      res.status(403).json({ error: "Forbidden", message: "Not authorized to view this unit" });
      return;
    }

    // Linked: tier-filter via label-based fallback in computeTier.
    const viewerUnitMembers = viewer.isAdmin
      ? []
      : await db
          .select()
          .from(personsTable)
          .where(eq(personsTable.familyUnitId, viewer.familyUnitId));

    const linkedResult = members
      .map((m) => {
        const tier = computeTier(viewer, m, viewerUnitMembers);
        if (tier === 4) return null;
        return applyVisibility(formatPerson(m), tier);
      })
      .filter(Boolean);

    res.json(linkedResult);
    return;
  }

  // Same unit (admin or non-admin): fetch the explicit relationships table
  // once so we can compute a viewer-relative relationship label for every
  // member (e.g. "Sibling", "Parent", "Me") instead of the static
  // relationshipLabel column, which is frozen to whoever the admin was when
  // the person was added.
  const relationships = await db
    .select({
      fromPerson: relationshipsTable.fromPerson,
      toPerson: relationshipsTable.toPerson,
      type: relationshipsTable.type,
    })
    .from(relationshipsTable)
    .where(eq(relationshipsTable.familyId, unitId));

  // Same-unit admin: full data.
  if (viewer.isAdmin) {
    res.json(
      members.map((m) => ({
        ...formatPerson(m),
        viewerRelationshipLabel: describeRelationship(viewer.id, m.id, members, relationships),
      })),
    );
    return;
  }

  // Same-unit non-admin: apply social graph visibility, seeded from the
  // explicit relationships table for accuracy, with label heuristic fallback.
  const visibleSet = computeVisibleSet(viewer, members, relationships);
  const result = members
    .map((m) => {
      const tier = visibleSet.get(m.id) ?? 4;
      if (tier === 4) return null;
      const filtered = applyVisibility(formatPerson(m), tier);
      if (!filtered) return null;
      return {
        ...filtered,
        viewerRelationshipLabel: describeRelationship(viewer.id, m.id, members, relationships),
      };
    })
    .filter(Boolean);

  res.json(result);
});

// POST /api/family-units/:unitId/members
router.post("/family-units/:unitId/members", requireAuth, requireAdmin, async (req, res) => {
  const unitId = String(req.params.unitId);
  if (req.auth?.familyUnitId !== unitId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = AddMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation error", message: parsed.error.message });
    return;
  }
  if (!isWithinFieldLengthLimits(parsed.data)) {
    res.status(400).json({ error: "Validation error", message: "One or more fields exceed the maximum allowed length." });
    return;
  }

  // parentPersonId must anchor to someone already in this family unit --
  // otherwise syncPersonToRelationshipLayer/addRelationship below would
  // create a relationship-layer edge referencing a person in a different
  // family (same class of gap as add_family_member in ai.ts).
  if (parsed.data.parentPersonId) {
    const [parentInUnit] = await db
      .select({ id: personsTable.id })
      .from(personsTable)
      .where(and(eq(personsTable.id, parsed.data.parentPersonId), eq(personsTable.familyUnitId, unitId)))
      .limit(1);
    if (!parentInUnit) {
      res.status(400).json({ error: "Validation error", message: "Unknown parentPersonId" });
      return;
    }
  }

  // Duplicate guard
  const existing = await db
    .select()
    .from(personsTable)
    .where(
      and(
        eq(personsTable.familyUnitId, unitId),
        ilike(personsTable.firstName, parsed.data.firstName.trim()),
        ilike(personsTable.lastName, parsed.data.lastName.trim()),
        ilike(personsTable.relationshipLabel, parsed.data.relationshipLabel.trim()),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Duplicate", message: "A member with that name and relationship already exists." });
    return;
  }

  const [person] = await db
    .insert(personsTable)
    .values({
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      relationshipLabel: parsed.data.relationshipLabel,
      gender: parsed.data.gender ?? null,
      parentPersonId: parsed.data.parentPersonId ?? null,
      familyUnitId: unitId,
      isAdmin: false,
      claimed: false,
    })
    .returning();

  // Sync to explicit relationship layer (best-effort)
  await syncPersonToRelationshipLayer({
    personId: person.id,
    familyId: unitId,
    firstName: person.firstName,
    lastName: person.lastName,
    label: person.relationshipLabel,
    adminId: req.auth!.personId,
    parentPersonId: person.parentPersonId,
  });

  res.status(201).json(formatPerson(person));
});

// GET /api/family-units/:unitId/relationships
// Returns all explicit relationship edges for the family unit.
router.get("/family-units/:unitId/relationships", requireAuth, async (req, res) => {
  const unitId = String(req.params.unitId);
  if (req.auth?.familyUnitId !== unitId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const rows = await db
    .select({
      fromPerson: relationshipsTable.fromPerson,
      toPerson: relationshipsTable.toPerson,
      type: relationshipsTable.type,
    })
    .from(relationshipsTable)
    .where(eq(relationshipsTable.familyId, unitId));

  res.json(rows);
});

// POST /api/family-units/:unitId/members/:personId/invite
router.post(
  "/family-units/:unitId/members/:personId/invite",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const unitId = String(req.params.unitId);
    if (req.auth?.familyUnitId !== unitId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const personId = String(req.params.personId);
    const token = nanoid(32);
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

    // Scope the update to this unit too, not just the requester's admin
    // status -- otherwise a same-family admin could still mint a live
    // invite token for an arbitrary personId belonging to a different
    // family just by knowing its UUID.
    const updated = await db
      .update(personsTable)
      .set({ inviteToken: token, inviteExpiresAt: expiresAt, updatedAt: new Date() })
      .where(and(eq(personsTable.id, personId), eq(personsTable.familyUnitId, unitId)))
      .returning();

    if (!updated.length) {
      res.status(404).json({ error: "Not found", message: "Person not found" });
      return;
    }

    const baseUrl = process.env.APP_BASE_URL
      ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://localhost:80");

    res.json({
      inviteToken: token,
      inviteUrl: `${baseUrl}/invite/${token}`,
      inviteExpiresAt: expiresAt.toISOString(),
    });
  },
);

export default router;
