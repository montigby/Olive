import { Router } from "express";
import { nanoid } from "nanoid";
import { db } from "@workspace/db";
import { personsTable } from "@workspace/db";
import { eq, and, ilike } from "drizzle-orm";
import { AddMemberBody } from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { formatPerson } from "./auth";

const router = Router();

// GET /api/family-units/:unitId/members
router.get("/family-units/:unitId/members", requireAuth, async (req, res) => {
  const unitId = String(req.params.unitId);
  const members = await db
    .select()
    .from(personsTable)
    .where(eq(personsTable.familyUnitId, unitId));

  res.json(members.map(formatPerson));
});

// POST /api/family-units/:unitId/members
router.post("/family-units/:unitId/members", requireAuth, requireAdmin, async (req, res) => {
  const unitId = String(req.params.unitId);
  const parsed = AddMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation error", message: parsed.error.message });
    return;
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
      parentPersonId: parsed.data.parentPersonId ?? null,
      familyUnitId: unitId,
      isAdmin: false,
      claimed: false,
    })
    .returning();

  res.status(201).json(formatPerson(person));
});

// POST /api/family-units/:unitId/members/:personId/invite
router.post(
  "/family-units/:unitId/members/:personId/invite",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const personId = String(req.params.personId);
    const token = nanoid(32);
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

    const updated = await db
      .update(personsTable)
      .set({ inviteToken: token, inviteExpiresAt: expiresAt, updatedAt: new Date() })
      .where(eq(personsTable.id, personId))
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
