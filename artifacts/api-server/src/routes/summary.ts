import { Router } from "express";
import { db } from "@workspace/db";
import {
  familyUnitsTable,
  personsTable,
  unitLinkRequestsTable,
} from "@workspace/db";
import { eq, or, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { formatPerson } from "./auth";

const router = Router();

interface TreeNode {
  unitId: string;
  unitName: string;
  parentUnitId: string | null;
  members: ReturnType<typeof formatPerson>[];
  children: TreeNode[];
}

async function buildTree(unitId: string): Promise<TreeNode> {
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

  const children = await Promise.all(childUnits.map((c) => buildTree(c.id)));

  return {
    unitId: unit.id,
    unitName: unit.unitName,
    parentUnitId: unit.parentUnitId ?? null,
    members: members.map(formatPerson),
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

  const rootNode = await buildTree(rootId);
  const { units, members } = countTree(rootNode);

  res.json({ rootUnit: rootNode, totalUnits: units, totalMembers: members });
});

// GET /api/family-units/:unitId/summary
router.get("/family-units/:unitId/summary", requireAuth, async (req, res) => {
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

  const members = await db
    .select()
    .from(personsTable)
    .where(eq(personsTable.familyUnitId, unitId));

  const totalMembers = members.length;
  const claimedMembers = members.filter((m) => m.claimed).length;
  const unclaimedMembers = totalMembers - claimedMembers;
  const claimRate = totalMembers > 0 ? Math.round((claimedMembers / totalMembers) * 100) : 0;
  const pendingInvites = members.filter(
    (m) => !m.claimed && m.inviteToken && m.inviteExpiresAt && m.inviteExpiresAt > new Date(),
  ).length;

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
  });
});

// GET /api/family-units/:unitId/birthdays
router.get("/family-units/:unitId/birthdays", requireAuth, async (req, res) => {
  const unitId = String(req.params.unitId);

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
      if (m.birthday) {
        allMembers.push({ person: m, unitName: u.unitName });
      }
    }
  }

  const now = new Date();
  const results = allMembers
    .map(({ person, unitName }) => {
      const bday = new Date(person.birthday!);
      const thisYear = new Date(now.getFullYear(), bday.getMonth(), bday.getDate());
      if (thisYear < now) thisYear.setFullYear(now.getFullYear() + 1);
      const daysUntil = Math.ceil((thisYear.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return {
        personId: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        relationshipLabel: person.relationshipLabel,
        birthday: person.birthday!,
        unitName,
        daysUntil,
      };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 20);

  res.json(results);
});

export default router;
