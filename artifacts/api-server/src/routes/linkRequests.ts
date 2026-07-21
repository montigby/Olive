import { Router } from "express";
import { db } from "@workspace/db";
import {
  familyUnitsTable,
  familyGroupsTable,
  personsTable,
  unitLinkRequestsTable,
} from "@workspace/db";
import { eq, and, or } from "drizzle-orm";
import { CreateLinkRequestBody } from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router = Router();

async function formatLinkRequest(lr: typeof unitLinkRequestsTable.$inferSelect) {
  const [reqUnit] = await db
    .select()
    .from(familyUnitsTable)
    .where(eq(familyUnitsTable.id, lr.requestingUnitId))
    .limit(1);
  const [tgtUnit] = await db
    .select()
    .from(familyUnitsTable)
    .where(eq(familyUnitsTable.id, lr.targetUnitId))
    .limit(1);
  const [connector] = await db
    .select()
    .from(personsTable)
    .where(eq(personsTable.id, lr.connectorPersonId))
    .limit(1);

  return {
    id: lr.id,
    requestingUnitId: lr.requestingUnitId,
    requestingUnitName: reqUnit?.unitName ?? "",
    targetUnitId: lr.targetUnitId,
    targetUnitName: tgtUnit?.unitName ?? "",
    connectorPersonId: lr.connectorPersonId,
    connectorPersonName: connector
      ? `${connector.firstName} ${connector.lastName}`
      : "",
    status: lr.status,
    createdAt: lr.createdAt.toISOString(),
    respondedAt: lr.respondedAt?.toISOString() ?? null,
  };
}

// POST /api/family-units/:unitId/link-requests
router.post(
  "/family-units/:unitId/link-requests",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const unitId = String(req.params.unitId);
    if (req.auth?.familyUnitId !== unitId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = CreateLinkRequestBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation error", message: parsed.error.message });
      return;
    }

    const { targetUnitId, connectorPersonId } = parsed.data;

    const [lr] = await db
      .insert(unitLinkRequestsTable)
      .values({
        requestingUnitId: unitId,
        targetUnitId,
        connectorPersonId,
        requestedBy: req.auth!.personId,
        status: "pending",
      })
      .returning();

    await db
      .update(familyUnitsTable)
      .set({ parentLinkStatus: "pending", updatedAt: new Date() })
      .where(eq(familyUnitsTable.id, unitId));

    res.status(201).json(await formatLinkRequest(lr));
  },
);

// GET /api/family-units/:unitId/link-requests
router.get("/family-units/:unitId/link-requests", requireAuth, async (req, res) => {
  const unitId = String(req.params.unitId);
  if (req.auth?.familyUnitId !== unitId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const all = await db
    .select()
    .from(unitLinkRequestsTable)
    .where(
      or(
        eq(unitLinkRequestsTable.requestingUnitId, unitId),
        eq(unitLinkRequestsTable.targetUnitId, unitId),
      ),
    );

  const incoming = all.filter((r) => r.targetUnitId === unitId);
  const outgoing = all.filter((r) => r.requestingUnitId === unitId);

  res.json({
    incoming: await Promise.all(incoming.map(formatLinkRequest)),
    outgoing: await Promise.all(outgoing.map(formatLinkRequest)),
  });
});

// POST /api/link-requests/:requestId/accept
router.post("/link-requests/:requestId/accept", requireAuth, requireAdmin, async (req, res) => {
  const requestId = String(req.params.requestId);

  const [lr] = await db
    .select()
    .from(unitLinkRequestsTable)
    .where(eq(unitLinkRequestsTable.id, requestId))
    .limit(1);

  if (!lr) {
    res.status(404).json({ error: "Not found", message: "Request not found" });
    return;
  }
  // Only an admin of the *target* unit can consent to a link -- otherwise
  // any admin anywhere could force through (or hijack) a pending request
  // between two unrelated families just by knowing/guessing its id.
  if (req.auth?.familyUnitId !== lr.targetUnitId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [updated] = await db
    .update(unitLinkRequestsTable)
    .set({ status: "accepted", respondedBy: req.auth!.personId, respondedAt: new Date() })
    .where(eq(unitLinkRequestsTable.id, requestId))
    .returning();

  await db
    .update(familyUnitsTable)
    .set({
      parentUnitId: lr.targetUnitId,
      parentLinkStatus: "accepted",
      parentLinkedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(familyUnitsTable.id, lr.requestingUnitId));

  const existingGroup = await db
    .select()
    .from(familyGroupsTable)
    .where(eq(familyGroupsTable.rootUnitId, lr.targetUnitId))
    .limit(1);

  if (!existingGroup.length) {
    await db.insert(familyGroupsTable).values({ rootUnitId: lr.targetUnitId });
  }

  res.json(await formatLinkRequest(updated));
});

// POST /api/link-requests/:requestId/decline
router.post("/link-requests/:requestId/decline", requireAuth, requireAdmin, async (req, res) => {
  const requestId = String(req.params.requestId);

  const [lr] = await db
    .select()
    .from(unitLinkRequestsTable)
    .where(eq(unitLinkRequestsTable.id, requestId))
    .limit(1);

  if (!lr) {
    res.status(404).json({ error: "Not found", message: "Request not found" });
    return;
  }
  if (req.auth?.familyUnitId !== lr.targetUnitId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [updated] = await db
    .update(unitLinkRequestsTable)
    .set({ status: "declined", respondedBy: req.auth!.personId, respondedAt: new Date() })
    .where(eq(unitLinkRequestsTable.id, requestId))
    .returning();

  await db
    .update(familyUnitsTable)
    .set({ parentLinkStatus: "none", updatedAt: new Date() })
    .where(eq(familyUnitsTable.id, lr.requestingUnitId));

  res.json(await formatLinkRequest(updated));
});

export default router;
