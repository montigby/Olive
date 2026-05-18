import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import {
  personsTable,
  familyUnitsTable,
  accountsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { ClaimProfileBody, MergePreviewBody, MergeConfirmBody } from "@workspace/api-zod";
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

// ─── Shared helper: validate invite token and return { person, unit } ──────────
async function validateInviteToken(token: string) {
  const rows = await db
    .select()
    .from(personsTable)
    .innerJoin(familyUnitsTable, eq(personsTable.familyUnitId, familyUnitsTable.id))
    .where(eq(personsTable.inviteToken, token))
    .limit(1);

  if (!rows.length) return { error: "Invalid or expired invite" as const };

  const { persons: person, family_units: unit } = rows[0];

  if (!person.inviteExpiresAt || person.inviteExpiresAt < new Date()) {
    return { error: "Invite link has expired" as const };
  }

  if (person.claimed) {
    return { error: "Profile already claimed" as const };
  }

  return { person, unit };
}

// POST /api/invites/:token/merge/preview
// Authenticates existing account and returns placeholder + existing person data
router.post("/invites/:token/merge/preview", async (req, res) => {
  const parsed = MergePreviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation error", message: parsed.error.message });
    return;
  }

  const result = await validateInviteToken(req.params.token);
  if ("error" in result) {
    res.status(400).json({ error: "Bad request", message: result.error });
    return;
  }

  const { person: placeholder, unit } = result;
  const { email, password } = parsed.data;

  // Authenticate the existing account
  const accounts = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.email, email.toLowerCase()))
    .limit(1);

  if (!accounts.length) {
    res.status(401).json({ error: "Unauthorized", message: "No account found with that email" });
    return;
  }

  const account = accounts[0];
  const valid = await bcrypt.compare(password, account.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
    return;
  }

  // Load the existing person record
  const existingPersons = await db
    .select()
    .from(personsTable)
    .where(eq(personsTable.id, account.personId))
    .limit(1);

  if (!existingPersons.length) {
    res.status(500).json({ error: "Internal error", message: "Existing person not found" });
    return;
  }

  const existingPerson = existingPersons[0];

  res.json({
    placeholder: {
      id: placeholder.id,
      firstName: placeholder.firstName,
      lastName: placeholder.lastName,
      relationshipLabel: placeholder.relationshipLabel,
      unitName: unit.unitName,
      unitId: unit.id,
    },
    existingPerson: {
      id: existingPerson.id,
      firstName: existingPerson.firstName,
      lastName: existingPerson.lastName,
      email: existingPerson.email,
      familyUnitId: existingPerson.familyUnitId,
    },
  });
});

// POST /api/invites/:token/merge/confirm
// Re-authenticates and executes the merge: updates the placeholder to be claimed
// with the existing account's email, then updates the account to point to the placeholder personId.
router.post("/invites/:token/merge/confirm", async (req, res) => {
  const parsed = MergeConfirmBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation error", message: parsed.error.message });
    return;
  }

  const result = await validateInviteToken(req.params.token);
  if ("error" in result) {
    res.status(400).json({ error: "Bad request", message: result.error });
    return;
  }

  const { person: placeholder, unit } = result;
  const { email, password } = parsed.data;

  // Re-authenticate the existing account
  const accounts = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.email, email.toLowerCase()))
    .limit(1);

  if (!accounts.length) {
    res.status(401).json({ error: "Unauthorized", message: "No account found with that email" });
    return;
  }

  const account = accounts[0];
  const valid = await bcrypt.compare(password, account.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
    return;
  }

  await db.transaction(async (tx) => {
    // Mark the placeholder as claimed with the existing account's email
    const [updatedPlaceholder] = await tx
      .update(personsTable)
      .set({
        email: email.toLowerCase(),
        claimed: true,
        claimedAt: new Date(),
        inviteToken: null,
        inviteExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(personsTable.id, placeholder.id))
      .returning();

    // Update the existing account's personId to point to the placeholder
    await tx
      .update(accountsTable)
      .set({ personId: placeholder.id, lastLoginAt: new Date() })
      .where(eq(accountsTable.id, account.id));

    const members = await tx
      .select()
      .from(personsTable)
      .where(eq(personsTable.familyUnitId, unit.id));

    const token = signToken({
      personId: updatedPlaceholder.id,
      familyUnitId: updatedPlaceholder.familyUnitId,
      isAdmin: updatedPlaceholder.isAdmin,
    });

    res.json({
      token,
      person: {
        ...formatPerson(updatedPlaceholder),
        familyUnit: formatUnit(unit, members.length, members.filter((m) => m.claimed).length),
      },
    });
  });
});

export default router;
