import { Router } from "express";
import { db } from "@workspace/db";
import { personsTable, accountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdatePersonBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { formatPerson } from "./auth";
import { computeTier, applyVisibility } from "../lib/visibility";

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

  // Load all members of the target's family unit (for potential future use)
  const allMembers = await db
    .select()
    .from(personsTable)
    .where(eq(personsTable.familyUnitId, target.familyUnitId));

  // If viewer is in a different unit, use tier logic; if same unit, computeTier handles it
  const tier = computeTier(viewer, target, allMembers);
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

  if (req.auth!.personId !== personId && !req.auth!.isAdmin) {
    res.status(403).json({ error: "Forbidden", message: "Cannot edit another person's profile" });
    return;
  }

  const parsed = UpdatePersonBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation error", message: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const updateData: Partial<typeof personsTable.$inferInsert> = {};
  if (data.firstName !== undefined) updateData.firstName = data.firstName;
  if (data.lastName !== undefined) updateData.lastName = data.lastName;
  if (data.photoUrl !== undefined) updateData.photoUrl = data.photoUrl;
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.addressLine1 !== undefined) updateData.addressLine1 = data.addressLine1;
  if (data.addressCity !== undefined) updateData.addressCity = data.addressCity;
  if (data.addressState !== undefined) updateData.addressState = data.addressState;
  if (data.addressZip !== undefined) updateData.addressZip = data.addressZip;
  if (data.addressCountry !== undefined) updateData.addressCountry = data.addressCountry;
  if (data.birthday !== undefined) updateData.birthday = data.birthday ?? undefined;
  if (data.showBirthYear !== undefined) updateData.showBirthYear = data.showBirthYear;
  if (data.instagram !== undefined) updateData.instagram = data.instagram;
  if (data.facebook !== undefined) updateData.facebook = data.facebook;
  if (data.tiktok !== undefined) updateData.tiktok = data.tiktok;
  if (data.linkedin !== undefined) updateData.linkedin = data.linkedin;
  if ((data as any).snapchat !== undefined) updateData.snapchat = (data as any).snapchat;
  if ((data as any).venmo !== undefined) updateData.venmo = (data as any).venmo;
  if (data.otherSocial !== undefined) updateData.otherSocial = data.otherSocial;
  if (data.relationshipLabel !== undefined && req.auth!.isAdmin) {
    updateData.relationshipLabel = data.relationshipLabel;
  }
  if (data.tier2ContactField !== undefined) updateData.tier2ContactField = data.tier2ContactField;
  if (data.confirmedMembersOnly !== undefined) updateData.confirmedMembersOnly = data.confirmedMembersOnly;
  updateData.updatedAt = new Date();

  const updated = await db
    .update(personsTable)
    .set(updateData)
    .where(eq(personsTable.id, personId))
    .returning();

  if (!updated.length) {
    res.status(404).json({ error: "Not found", message: "Person not found" });
    return;
  }

  res.json(formatPerson(updated[0]));
});

// DELETE /api/persons/:personId
router.delete("/persons/:personId", requireAuth, async (req, res) => {
  const personId = String(req.params.personId);

  if (req.auth!.personId !== personId && !req.auth!.isAdmin) {
    res.status(403).json({ error: "Forbidden", message: "Cannot remove another person" });
    return;
  }

  await db.delete(accountsTable).where(eq(accountsTable.personId, personId));
  await db.delete(personsTable).where(eq(personsTable.id, personId));

  res.json({ message: "Person deleted" });
});

export default router;
