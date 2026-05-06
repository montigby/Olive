import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import {
  personsTable,
  familyUnitsTable,
  accountsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { ClaimProfileBody } from "@workspace/api-zod";
import { signToken } from "../middlewares/auth";
import { formatPerson, formatUnit } from "./auth";

const router = Router();

// GET /api/invites/:token
router.get("/invites/:token", async (req, res) => {
  const persons = await db
    .select()
    .from(personsTable)
    .innerJoin(familyUnitsTable, eq(personsTable.familyUnitId, familyUnitsTable.id))
    .where(eq(personsTable.inviteToken, req.params.token))
    .limit(1);

  if (!persons.length) {
    res.status(404).json({ error: "Not found", message: "Invalid or expired invite" });
    return;
  }

  const { persons: person, family_units: unit } = persons[0];

  if (!person.inviteExpiresAt || person.inviteExpiresAt < new Date()) {
    res.status(404).json({ error: "Not found", message: "Invite link has expired" });
    return;
  }

  if (person.claimed) {
    res.status(400).json({ error: "Bad request", message: "Profile already claimed" });
    return;
  }

  res.json({
    personId: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    relationshipLabel: person.relationshipLabel,
    unitName: unit.unitName,
    inviteExpiresAt: person.inviteExpiresAt.toISOString(),
  });
});

// POST /api/invites/:token/claim
router.post("/invites/:token/claim", async (req, res) => {
  const parsed = ClaimProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation error", message: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  const persons = await db
    .select()
    .from(personsTable)
    .innerJoin(familyUnitsTable, eq(personsTable.familyUnitId, familyUnitsTable.id))
    .where(eq(personsTable.inviteToken, req.params.token))
    .limit(1);

  if (!persons.length) {
    res.status(400).json({ error: "Bad request", message: "Invalid or expired invite" });
    return;
  }

  const { persons: person, family_units: unit } = persons[0];

  if (!person.inviteExpiresAt || person.inviteExpiresAt < new Date()) {
    res.status(400).json({ error: "Bad request", message: "Invite link has expired" });
    return;
  }

  if (person.claimed) {
    res.status(400).json({ error: "Bad request", message: "Profile already claimed" });
    return;
  }

  const existingAccount = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.email, email.toLowerCase()))
    .limit(1);

  if (existingAccount.length) {
    res.status(409).json({ error: "Conflict", message: "Email already in use" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.transaction(async (tx) => {
    const [updatedPerson] = await tx
      .update(personsTable)
      .set({
        email: email.toLowerCase(),
        claimed: true,
        claimedAt: new Date(),
        inviteToken: null,
        inviteExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(personsTable.id, person.id))
      .returning();

    await tx.insert(accountsTable).values({
      personId: person.id,
      email: email.toLowerCase(),
      passwordHash,
    });

    const members = await tx
      .select()
      .from(personsTable)
      .where(eq(personsTable.familyUnitId, unit.id));

    const token = signToken({
      personId: updatedPerson.id,
      familyUnitId: updatedPerson.familyUnitId,
      isAdmin: updatedPerson.isAdmin,
    });

    res.json({
      token,
      person: {
        ...formatPerson(updatedPerson),
        familyUnit: formatUnit(unit, members.length, members.filter((m) => m.claimed).length),
      },
    });
  });
});

export default router;
