import { Router } from "express";
import { nanoid } from "nanoid";
import { db } from "@workspace/db";
import { familyUnitsTable, personsTable, relationshipsTable } from "@workspace/db";
import { eq, ilike, count } from "drizzle-orm";
import { CreateFamilyUnitBody, UpdateFamilyUnitBody } from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { formatPerson, formatUnit } from "./auth";
import { computeVisibleSet, computeTier, applyVisibility } from "../lib/visibility";
import { areUnitsLinked } from "../lib/unitAccess";

const router = Router();

// POST /api/family-units
router.post("/family-units", requireAuth, async (req, res) => {
  const parsed = CreateFamilyUnitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation error", message: parsed.error.message });
    return;
  }

  const unitCode = nanoid(8).toUpperCase();
  const [unit] = await db
    .insert(familyUnitsTable)
    .values({ unitName: parsed.data.unitName, unitCode, createdBy: req.auth!.personId })
    .returning();

  res.status(201).json(formatUnit(unit, 0, 0));
});

// GET /api/family-units/search
router.get("/family-units/search", requireAuth, async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) {
    res.json([]);
    return;
  }

  const units = await db
    .select()
    .from(familyUnitsTable)
    .where(ilike(familyUnitsTable.unitName, `%${q}%`))
    .limit(10);

  const results = await Promise.all(
    units.map(async (u) => {
      const [row] = await db
        .select({ count: count() })
        .from(personsTable)
        .where(eq(personsTable.familyUnitId, u.id));
      return {
        id: u.id,
        unitName: u.unitName,
        unitCode: u.unitCode,
        memberCount: Number(row?.count ?? 0),
      };
    }),
  );

  res.json(results);
});

// GET /api/family-units/:unitId
router.get("/family-units/:unitId", requireAuth, async (req, res) => {
  const unitId = String(req.params.unitId);
  const units = await db
    .select()
    .from(familyUnitsTable)
    .where(eq(familyUnitsTable.id, unitId))
    .limit(1);

  if (!units.length) {
    res.status(404).json({ error: "Not found", message: "Unit not found" });
    return;
  }

  const unit = units[0];
  const members = await db
    .select()
    .from(personsTable)
    .where(eq(personsTable.familyUnitId, unit.id));

  const totalMembers = members.length;
  const claimedMembers = members.filter((m) => m.claimed).length;

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
  if (viewer.familyUnitId !== unit.id) {
    if (!(await areUnitsLinked(viewer.familyUnitId, unit.id))) {
      res.status(403).json({ error: "Forbidden", message: "Not authorized to view this unit" });
      return;
    }

    const viewerUnitMembers = viewer.isAdmin
      ? []
      : await db
          .select()
          .from(personsTable)
          .where(eq(personsTable.familyUnitId, viewer.familyUnitId));

    const linkedMembers = members
      .map((m) => {
        const tier = computeTier(viewer, m, viewerUnitMembers);
        if (tier === 4) return null;
        return applyVisibility(formatPerson(m), tier);
      })
      .filter(Boolean);

    res.json({
      ...formatUnit(unit, totalMembers, claimedMembers),
      members: linkedMembers,
    });
    return;
  }

  // Same-unit admin: full data.
  if (viewer.isAdmin) {
    res.json({
      ...formatUnit(unit, totalMembers, claimedMembers),
      members: members.map(formatPerson),
    });
    return;
  }

  // Same-unit non-admin: apply social graph visibility, seeded from the
  // explicit relationships table for accuracy, with label heuristic fallback.
  const relationships = await db
    .select({
      fromPerson: relationshipsTable.fromPerson,
      toPerson: relationshipsTable.toPerson,
      type: relationshipsTable.type,
    })
    .from(relationshipsTable)
    .where(eq(relationshipsTable.familyId, unit.id));

  const visibleSet = computeVisibleSet(viewer, members, relationships);
  const filteredMembers = members
    .map((m) => {
      const tier = visibleSet.get(m.id) ?? 4;
      if (tier === 4) return null;
      return applyVisibility(formatPerson(m), tier);
    })
    .filter(Boolean);

  res.json({
    ...formatUnit(unit, totalMembers, claimedMembers),
    members: filteredMembers,
  });
});

// PATCH /api/family-units/:unitId
router.patch("/family-units/:unitId", requireAuth, requireAdmin, async (req, res) => {
  const unitId = String(req.params.unitId);
  const parsed = UpdateFamilyUnitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation error", message: parsed.error.message });
    return;
  }

  const updateData: Partial<typeof familyUnitsTable.$inferInsert> = {};
  if (parsed.data.unitName) updateData.unitName = parsed.data.unitName;
  if (parsed.data.membersCanInvite !== undefined) updateData.membersCanInvite = parsed.data.membersCanInvite;
  updateData.updatedAt = new Date();

  const updated = await db
    .update(familyUnitsTable)
    .set(updateData)
    .where(eq(familyUnitsTable.id, unitId))
    .returning();

  if (!updated.length) {
    res.status(404).json({ error: "Not found", message: "Unit not found" });
    return;
  }

  const members = await db
    .select()
    .from(personsTable)
    .where(eq(personsTable.familyUnitId, updated[0].id));

  res.json(formatUnit(updated[0], members.length, members.filter((m) => m.claimed).length));
});

export default router;
