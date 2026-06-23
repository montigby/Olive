import { Router } from "express";
import { db } from "@workspace/db";
import {
  familyUnitsTable,
  personsTable,
  relationshipsTable,
  unitLinkRequestsTable,
} from "@workspace/db";
import { eq, or, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { formatPerson } from "./auth";
import { computeTier, computeVisibleSet, applyVisibility } from "../lib/visibility";

const router = Router();

type PersonRow = typeof personsTable.$inferSelect;
type MemberDecorator = (m: PersonRow) => unknown | null;

interface TreeNode {
  unitId: string;
  unitName: string;
  parentUnitId: string | null;
  members: unknown[];
  children: TreeNode[];
}

async function buildTree(
  unitId: string,
  decorate: MemberDecorator,
): Promise<TreeNode> {
  const [unit] = await db
    .select()
    .from(familyUnitsTable)
    .where(eq(familyUnitsTable.id, unitId))
    .limit(1);

  const members = await db
    .select()
    .from(personsTable)
    .where(eq(personsTable.familyUnitId, unitId));

  const childUnits = await db
    .select()
    .from(familyUnitsTable)
    .where(
      and(
        eq(familyUnitsTable.parentUnitId, unitId),
        eq(familyUnitsTable.parentLinkStatus, "accepted"),
      ),
    );

  const children = await Promise.all(
    childUnits.map((c) => buildTree(c.id, decorate)),
  );

  const visibleMembers = members
    .map(decorate)
    .filter((m): m is NonNullable<typeof m> => m !== null);

  return {
    unitId: unit.id,
    unitName: unit.unitName,
    parentUnitId: unit.parentUnitId ?? null,
    members: visibleMembers,
    children,
  };
}

function countTree(node: TreeNode): { units: number; members: number } {
  const childCounts = node.children.map(countTree);
  return {
    units: 1 + childCounts.reduce((s, c) => s + c.units, 0),
    members: node.members.length + childCounts.reduce((s, c) => s + c.members, 0),
  };
}

// GET /api/family-units/:unitId/tree
router.get("/family-units/:unitId/tree", requireAuth, async (req, res) => {
  const unitId = String(req.params.unitId);

  const [unit] = await db
    .select()
    .from(familyUnitsTable)
    .where(eq(familyUnitsTable.id, unitId))
    .limit(1);

  if (!unit) {
    res.status(404).json({ error: "Not found", message: "Unit not found" });
    return;
  }

  let rootId = unitId;
  let current = unit;
  while (current.parentUnitId && current.parentLinkStatus === "accepted") {
    const parentId: string = current.parentUnitId;
    const [parent] = await db
      .select()
      .from(familyUnitsTable)
      .where(eq(familyUnitsTable.id, parentId))
      .limit(1);
    if (!parent) break;
    rootId = parent.id;
    current = parent;
  }

  const [viewer] = await db
    .select()
    .from(personsTable)
    .where(eq(personsTable.id, req.auth!.personId))
    .limit(1);

  if (!viewer) {
    res.status(401).json({ error: "Unauthorized", message: "Viewer not found" });
    return;
  }

  // Pre-fetch the viewer's unit members AND relationships for graph-based
  // tier computation. computeTier uses both only when target is in the same
  // unit as viewer; cross-unit comparisons fall back to label-based tiering.
  const viewerUnitMembers = viewer.isAdmin
    ? []
    : await db
        .select()
        .from(personsTable)
        .where(eq(personsTable.familyUnitId, viewer.familyUnitId));

  const viewerUnitRelationships = viewer.isAdmin
    ? []
    : await db
        .select({
          fromPerson: relationshipsTable.fromPerson,
          toPerson: relationshipsTable.toPerson,
          type: relationshipsTable.type,
        })
        .from(relationshipsTable)
        .where(eq(relationshipsTable.familyId, viewer.familyUnitId));

  const decorate: MemberDecorator = (m) => {
    const tier = computeTier(viewer, m, viewerUnitMembers, viewerUnitRelationships);
    if (tier === 4) return null;
    return applyVisibility(formatPerson(m), tier);
  };

  const rootNode = await buildTree(rootId, decorate);

  const { units, members } = countTree(rootNode);

  res.json({ rootUnit: rootNode, totalUnits: units, totalMembers: members });
});

// GET /api/family-units/:unitId/summary
router.get("/family-units/:unitId/summary", requireAuth, async (req, res) => {
  const unitId = String(req.params.unitId);

  if (req.auth?.familyUnitId !== unitId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [unit] = await db
    .select()
    .from(familyUnitsTable)
    .where(eq(familyUnitsTable.id, unitId))
    .limit(1);

  if (!unit) {
    res.status(404).json({ error: "Not found", message: "Unit not found" });
    return;
  }

  const members = await db
    .select()
    .from(personsTable)
    .where(eq(personsTable.familyUnitId, unitId));

  // Apply social-graph visibility so the dashboard counts reflect what the
  // viewer can actually see in the directory / tree. Without this, every
  // member (incl. admin-side viewers like James) saw the FULL unit's totals
  // even though their directory only listed the visible subset. Admin gets
  // tier 0 to everyone → counts the whole unit, as expected.
  const viewer = members.find((m) => m.id === req.auth!.personId);
  let countableMembers = members;
  if (viewer && !viewer.isAdmin) {
    const relationships = await db
      .select({
        fromPerson: relationshipsTable.fromPerson,
        toPerson: relationshipsTable.toPerson,
        type: relationshipsTable.type,
      })
      .from(relationshipsTable)
      .where(eq(relationshipsTable.familyId, unitId));
    const visibleSet = computeVisibleSet(viewer, members, relationships);
    countableMembers = members.filter((m) => (visibleSet.get(m.id) ?? 4) <= 2);
  }

  const totalMembers = countableMembers.length;
  const claimedMembers = countableMembers.filter((m) => m.claimed).length;
  const unclaimedMembers = totalMembers - claimedMembers;
  const claimRate = totalMembers > 0 ? Math.round((claimedMembers / totalMembers) * 100) : 0;
  const pendingInvites = countableMembers.filter(
    (m) => !m.claimed && m.inviteToken && m.inviteExpiresAt && m.inviteExpiresAt > new Date(),
  ).length;
  const birthdayCount = countableMembers.filter((m) => !!m.birthday).length;
  const phoneCount = countableMembers.filter((m) => !!m.phone).length;

  const linkedUnits = await db
    .select()
    .from(familyUnitsTable)
    .where(
      and(
        eq(familyUnitsTable.parentUnitId, unitId),
        eq(familyUnitsTable.parentLinkStatus, "accepted"),
      ),
    );

  const pendingRequests = await db
    .select()
    .from(unitLinkRequestsTable)
    .where(
      and(
        or(
          eq(unitLinkRequestsTable.requestingUnitId, unitId),
          eq(unitLinkRequestsTable.targetUnitId, unitId),
        ),
        eq(unitLinkRequestsTable.status, "pending"),
      ),
    );

  res.json({
    unitId,
    unitName: unit.unitName,
    totalMembers,
    claimedMembers,
    unclaimedMembers,
    claimRate,
    linkedUnits: linkedUnits.length,
    pendingInvites,
    pendingLinkRequests: pendingRequests.length,
    birthdayCount,
    phoneCount,
  });
});

// GET /api/family-units/:unitId/birthdays
router.get("/family-units/:unitId/birthdays", requireAuth, async (req, res) => {
  const unitId = String(req.params.unitId);

  const [viewer] = await db
    .select()
    .from(personsTable)
    .where(eq(personsTable.id, req.auth!.personId))
    .limit(1);

  if (!viewer) {
    res.status(401).json({ error: "Unauthorized", message: "Viewer not found" });
    return;
  }

  if (viewer.familyUnitId !== unitId) {
    res.status(403).json({ error: "Forbidden", message: "Not authorized to view this unit" });
    return;
  }

  const childUnits = await db
    .select()
    .from(familyUnitsTable)
    .where(
      and(
        eq(familyUnitsTable.parentUnitId, unitId),
        eq(familyUnitsTable.parentLinkStatus, "accepted"),
      ),
    );

  const unitIds: string[] = [unitId, ...childUnits.map((u) => u.id)];

  // Pre-fetch viewer's unit members AND relationships for graph-based tier
  // computation (used by computeTier when target is same-unit; cross-unit
  // members fall back to label-based tiering and ignore both lists).
  const viewerUnitMembers = viewer.isAdmin
    ? []
    : await db
        .select()
        .from(personsTable)
        .where(eq(personsTable.familyUnitId, viewer.familyUnitId));

  const viewerUnitRelationships = viewer.isAdmin
    ? []
    : await db
        .select({
          fromPerson: relationshipsTable.fromPerson,
          toPerson: relationshipsTable.toPerson,
          type: relationshipsTable.type,
        })
        .from(relationshipsTable)
        .where(eq(relationshipsTable.familyId, viewer.familyUnitId));

  const allMembers: Array<{ person: typeof personsTable.$inferSelect; unitName: string }> = [];

  for (const uid of unitIds) {
    const [u] = await db
      .select()
      .from(familyUnitsTable)
      .where(eq(familyUnitsTable.id, uid))
      .limit(1);

    const members = await db
      .select()
      .from(personsTable)
      .where(eq(personsTable.familyUnitId, uid));

    for (const m of members) {
      if (!m.birthday) continue;
      const tier = computeTier(viewer, m, viewerUnitMembers, viewerUnitRelationships);
      // Birthday is only visible at tiers 0-2; drop tier 3 and 4.
      if (tier > 2) continue;
      allMembers.push({ person: m, unitName: u.unitName });
    }
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const results = allMembers
    .map(({ person, unitName }) => {
      const bday = new Date(person.birthday!);
      const thisYear = new Date(now.getFullYear(), bday.getMonth(), bday.getDate());
      let daysUntil = Math.round((thisYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      // Within past 7 days: keep negative daysUntil so callers can show "X days ago".
      // Beyond 7 days ago: advance to next year as a future birthday.
      if (daysUntil < -7) {
        thisYear.setFullYear(now.getFullYear() + 1);
        daysUntil = Math.round((thisYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      }
      return {
        personId: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        relationshipLabel: person.relationshipLabel,
        birthday: person.showBirthYear ? person.birthday! : `2000-${person.birthday!.split("-")[1]}-${person.birthday!.split("-")[2]}`,
        showBirthYear: person.showBirthYear,
        unitName,
        daysUntil,
      };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 30);

  res.json(results);
});

export default router;
