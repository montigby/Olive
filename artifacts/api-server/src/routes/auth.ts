import { Router } from "express";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import rateLimit from "express-rate-limit";
import { db } from "@workspace/db";
import {
  personsTable,
  familyUnitsTable,
  accountsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import { signToken, requireAuth, getPersonWithUnit } from "../middlewares/auth";

const router = Router();

// Caps brute-force password guessing against a single email while staying
// generous for a real family member fumbling their own password.
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${req.body?.email ?? ""}`,
  message: { error: "Too many login attempts", message: "Please try again in a few minutes." },
});

function formatPerson(p: typeof personsTable.$inferSelect) {
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    photoUrl: p.photoUrl,
    phone: p.phone,
    email: p.email,
    addressLine1: p.addressLine1,
    addressCity: p.addressCity,
    addressState: p.addressState,
    addressZip: p.addressZip,
    addressCountry: p.addressCountry,
    birthday: p.birthday,
    showBirthYear: p.showBirthYear,
    instagram: p.instagram,
    facebook: p.facebook,
    tiktok: p.tiktok,
    linkedin: p.linkedin,
    snapchat: p.snapchat,
    venmo: p.venmo,
    bereal: p.bereal,
    otherSocial: p.otherSocial,
    relationshipLabel: p.relationshipLabel,
    gender: p.gender ?? null,
    parentPersonId: p.parentPersonId ?? null,
    familyUnitId: p.familyUnitId,
    isAdmin: p.isAdmin,
    claimed: p.claimed,
    claimedAt: p.claimedAt?.toISOString() ?? null,
    inviteExpiresAt: p.inviteExpiresAt?.toISOString() ?? null,
    tier2ContactField: p.tier2ContactField,
    confirmedMembersOnly: p.confirmedMembersOnly,
    hideAddress: p.hideAddress,
    hideInstagram: p.hideInstagram,
    hideFacebook: p.hideFacebook,
    hideTiktok: p.hideTiktok,
    hideLinkedin: p.hideLinkedin,
    hideSnapchat: p.hideSnapchat,
    hideVenmo: p.hideVenmo,
    hideBereal: p.hideBereal,
    hideOtherSocial: p.hideOtherSocial,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function formatUnit(u: typeof familyUnitsTable.$inferSelect, memberCount = 0, claimedCount = 0) {
  return {
    id: u.id,
    unitName: u.unitName,
    unitCode: u.unitCode,
    parentUnitId: u.parentUnitId,
    parentLinkStatus: u.parentLinkStatus,
    parentLinkedAt: u.parentLinkedAt?.toISOString() ?? null,
    membersCanInvite: u.membersCanInvite,
    createdAt: u.createdAt.toISOString(),
    memberCount,
    claimedCount,
  };
}

// POST /api/auth/register
router.post("/auth/register", async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation error", message: parsed.error.message });
    return;
  }

  const { email, password, firstName, lastName, unitName, relationshipLabel } = parsed.data;

  const existing = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.email, email.toLowerCase()))
    .limit(1);

  if (existing.length) {
    res.status(409).json({ error: "Conflict", message: "Email already in use" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const unitCode = nanoid(8).toUpperCase();

  await db.transaction(async (tx) => {
    const [tempUnit] = await tx
      .insert(familyUnitsTable)
      .values({
        unitName,
        unitCode,
        createdBy: "00000000-0000-0000-0000-000000000000",
      })
      .returning();

    const [person] = await tx
      .insert(personsTable)
      .values({
        firstName,
        lastName,
        email: email.toLowerCase(),
        relationshipLabel,
        familyUnitId: tempUnit.id,
        isAdmin: true,
        claimed: true,
        claimedAt: new Date(),
      })
      .returning();

    await tx
      .update(familyUnitsTable)
      .set({ createdBy: person.id })
      .where(eq(familyUnitsTable.id, tempUnit.id));

    await tx.insert(accountsTable).values({
      personId: person.id,
      email: email.toLowerCase(),
      passwordHash,
    });

    const token = signToken({
      personId: person.id,
      familyUnitId: tempUnit.id,
      isAdmin: true,
    });

    res.status(201).json({
      token,
      person: {
        ...formatPerson(person),
        familyUnit: formatUnit(tempUnit, 1, 1),
      },
    });
  });
});

// POST /api/auth/login
router.post("/auth/login", loginLimiter, async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation error", message: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  const accounts = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.email, email.toLowerCase()))
    .limit(1);

  if (!accounts.length) {
    res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
    return;
  }

  const account = accounts[0];
  const valid = await bcrypt.compare(password, account.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
    return;
  }

  await db
    .update(accountsTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(accountsTable.id, account.id));

  const personWithUnit = await getPersonWithUnit(account.personId);
  if (!personWithUnit) {
    res.status(500).json({ error: "Internal error", message: "Person not found" });
    return;
  }

  const { familyUnit, ...person } = personWithUnit;

  const members = await db
    .select()
    .from(personsTable)
    .where(eq(personsTable.familyUnitId, person.familyUnitId));

  const token = signToken({
    personId: person.id,
    familyUnitId: person.familyUnitId,
    isAdmin: person.isAdmin,
  });

  res.json({
    token,
    person: {
      ...formatPerson(person),
      familyUnit: formatUnit(familyUnit, members.length, members.filter((m) => m.claimed).length),
    },
  });
});

// POST /api/auth/logout
router.post("/auth/logout", (_req, res) => {
  res.json({ message: "Logged out" });
});

// GET /api/auth/me
router.get("/auth/me", requireAuth, async (req, res) => {
  const personWithUnit = await getPersonWithUnit(req.auth!.personId);
  if (!personWithUnit) {
    res.status(401).json({ error: "Unauthorized", message: "Person not found" });
    return;
  }

  const { familyUnit, ...person } = personWithUnit;

  const members = await db
    .select()
    .from(personsTable)
    .where(eq(personsTable.familyUnitId, person.familyUnitId));

  res.json({
    ...formatPerson(person),
    familyUnit: formatUnit(familyUnit, members.length, members.filter((m) => m.claimed).length),
  });
});

// POST /api/auth/change-password
router.post("/auth/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!currentPassword || !newPassword || newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters." });
    return;
  }

  const [account] = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.personId, req.auth!.personId))
    .limit(1);

  if (!account) {
    res.status(404).json({ error: "Account not found." });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, account.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Current password is incorrect." });
    return;
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await db
    .update(accountsTable)
    .set({ passwordHash: newHash })
    .where(eq(accountsTable.personId, req.auth!.personId));

  res.json({ ok: true });
});

export { formatPerson, formatUnit };
export default router;
