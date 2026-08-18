import { Router } from "express";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { db } from "@workspace/db";
import {
  personsTable,
  familyUnitsTable,
  accountsTable,
  passwordResetTokensTable,
  emailVerificationTokensTable,
} from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import {
  RegisterBody,
  LoginBody,
  ForgotPasswordBody,
  ResetPasswordBody,
  VerifyEmailBody,
} from "@workspace/api-zod";
import { signToken, requireAuth, getPersonWithUnit } from "../middlewares/auth";
import { syncPersonToRelationshipLayer } from "../lib/syncRelationship";
import { sendPasswordResetEmail, sendVerificationEmail } from "../lib/email";

// A verification link has no urgency pressure the way a password reset does
// (nothing is blocked while it sits unclicked), so it gets a much longer
// window than the 1-hour reset-token expiry.
const EMAIL_VERIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const router = Router();

// Caps brute-force password guessing against a single email while staying
// generous for a real family member fumbling their own password. Login is
// pre-auth by definition, so this always keys on IP -- ipKeyGenerator
// normalizes IPv6 to a subnet prefix instead of the raw address, since an
// attacker can otherwise rotate through effectively unlimited distinct
// addresses within their own assigned IPv6 prefix to dodge the cap.
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? "unknown")}:${req.body?.email ?? ""}`,
  message: { error: "Too many login attempts", message: "Please try again in a few minutes." },
});

// Same shape as loginLimiter: keyed on IP+email so a flood targeting one
// address can't drown out other users, and IPv6 addresses can't dodge the
// cap by rotating within an attacker's own /64. Low limit -- a real user
// only needs this a handful of times, and it doubles as an anti-enumeration
// throttle since the response is identical either way.
const forgotPasswordLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? "unknown")}:${req.body?.email ?? ""}`,
  message: { error: "Too many requests", message: "Please try again in a few minutes." },
});

// Same shape as forgotPasswordLimiter, but the caller is already
// authenticated here (unlike forgot-password, which is pre-auth and has no
// identity to key on besides IP+email) -- so this keys on personId instead.
// There's no enumeration concern to double as a defense against either, this
// is purely to stop a bad actor with a stolen token from hammering Resend.
const resendVerificationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.personId ?? ipKeyGenerator(req.ip ?? "unknown"),
  message: { error: "Too many requests", message: "Please try again in a few minutes." },
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
    notes: p.notes,
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
    deceased: p.deceased,
    dateOfPassing: p.dateOfPassing,
    memoryCollectionEnabled: p.memoryCollectionEnabled,
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

  // Public, unauthenticated endpoint -- RegisterBody's Zod schema only
  // checks shape (zod.string()), not length, so cap the free-text fields
  // here to stop a bad actor from writing an arbitrarily large row.
  if (
    firstName.length > 100 ||
    lastName.length > 100 ||
    unitName.length > 200 ||
    relationshipLabel.length > 100 ||
    email.length > 320
  ) {
    res.status(400).json({ error: "Validation error", message: "One or more fields exceed the maximum allowed length." });
    return;
  }

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

  // Set outside the transaction once we know it committed, so the
  // best-effort verification email is only sent after the account actually
  // exists -- and so a slow/failing email provider never holds the DB
  // transaction (or the response) open.
  let verificationEmailTarget: { to: string; token: string } | null = null;

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

    // Sync to explicit relationship layer (best-effort)
    await syncPersonToRelationshipLayer({
      personId: person.id,
      familyId: tempUnit.id,
      firstName: person.firstName,
      lastName: person.lastName,
      label: person.relationshipLabel,
      adminId: person.id,
      parentPersonId: person.parentPersonId,
    });

    await tx
      .update(familyUnitsTable)
      .set({ createdBy: person.id })
      .where(eq(familyUnitsTable.id, tempUnit.id));

    const [account] = await tx
      .insert(accountsTable)
      .values({
        personId: person.id,
        email: email.toLowerCase(),
        passwordHash,
      })
      .returning();

    const verificationToken = nanoid(32);
    await tx.insert(emailVerificationTokensTable).values({
      accountId: account.id,
      token: verificationToken,
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
    });
    verificationEmailTarget = { to: account.email, token: verificationToken };

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
        emailVerified: false,
      },
    });
  });

  // Fire the verification email only after the transaction has committed,
  // and never let its outcome affect the response above -- registration must
  // never fail or feel broken because of an email-provider hiccup. This is
  // the one deliberate exception to "verification never blocks anything."
  if (verificationEmailTarget) {
    try {
      await sendVerificationEmail(verificationEmailTarget);
    } catch (err) {
      console.error("Failed to send verification email:", err);
    }
  }
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
      emailVerified: !!person.emailVerifiedAt,
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
    emailVerified: !!person.emailVerifiedAt,
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

// POST /api/auth/forgot-password
// Always resolves to the same generic 200, whether or not the email is
// registered -- this is the one place in the app that gets email-enumeration
// prevention right (login's error paths don't, as a general note). If the
// account exists, mint a single-use token good for 1 hour and email it.
router.post("/auth/forgot-password", forgotPasswordLimiter, async (req, res) => {
  const parsed = ForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation error", message: parsed.error.message });
    return;
  }

  const GENERIC_RESPONSE = {
    message: "If that email is registered, a reset link has been sent.",
  };

  const { email } = parsed.data;
  if (email.length > 320) {
    res.status(400).json({ error: "Validation error", message: "Email exceeds the maximum allowed length." });
    return;
  }

  const accounts = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.email, email.toLowerCase()))
    .limit(1);

  if (!accounts.length) {
    res.json(GENERIC_RESPONSE);
    return;
  }

  const account = accounts[0];
  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.insert(passwordResetTokensTable).values({
    accountId: account.id,
    token,
    expiresAt,
  });

  try {
    await sendPasswordResetEmail({ to: account.email, token });
  } catch (err) {
    // Best-effort: a transient email-provider failure shouldn't leak account
    // existence to the caller via a different response shape or status code.
    console.error("Failed to send password reset email:", err);
  }

  res.json(GENERIC_RESPONSE);
});

// POST /api/auth/reset-password
router.post("/auth/reset-password", async (req, res) => {
  const parsed = ResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation error", message: parsed.error.message });
    return;
  }

  const { token, newPassword } = parsed.data;

  if (newPassword.length < 8) {
    res.status(400).json({ error: "Validation error", message: "New password must be at least 8 characters." });
    return;
  }

  const rows = await db
    .select()
    .from(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.token, token))
    .limit(1);

  const resetToken = rows[0];
  if (!resetToken) {
    res.status(400).json({ error: "Invalid token", message: "This reset link is invalid." });
    return;
  }
  if (resetToken.usedAt) {
    res.status(400).json({ error: "Invalid token", message: "This reset link has already been used." });
    return;
  }
  if (resetToken.expiresAt.getTime() < Date.now()) {
    res.status(400).json({ error: "Invalid token", message: "This reset link has expired." });
    return;
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(accountsTable)
      .set({ passwordHash: newHash })
      .where(eq(accountsTable.id, resetToken.accountId));

    // Mark this token used, and invalidate any other still-live reset tokens
    // for the same account (defense in depth -- if multiple reset emails
    // went out, only the one actually redeemed should remain meaningful).
    await tx
      .update(passwordResetTokensTable)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetTokensTable.accountId, resetToken.accountId),
          isNull(passwordResetTokensTable.usedAt),
        ),
      );
  });

  res.json({ ok: true });
});

// POST /api/auth/verify-email
// Non-blocking by design: an unverified account already has full access.
// This just confirms the address is real, e.g. so password-reset links and
// automated emails have somewhere real to land.
router.post("/auth/verify-email", async (req, res) => {
  const parsed = VerifyEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation error", message: parsed.error.message });
    return;
  }

  const { token } = parsed.data;

  const rows = await db
    .select()
    .from(emailVerificationTokensTable)
    .where(eq(emailVerificationTokensTable.token, token))
    .limit(1);

  const verificationToken = rows[0];
  if (!verificationToken) {
    res.status(400).json({ error: "Invalid token", message: "This verification link is invalid." });
    return;
  }
  if (verificationToken.usedAt) {
    res.status(400).json({ error: "Invalid token", message: "This verification link has already been used." });
    return;
  }
  if (verificationToken.expiresAt.getTime() < Date.now()) {
    res.status(400).json({ error: "Invalid token", message: "This verification link has expired." });
    return;
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(accountsTable)
      .set({ emailVerifiedAt: now })
      .where(eq(accountsTable.id, verificationToken.accountId));

    // Mark this token used, and invalidate any other still-live verification
    // tokens for the same account (defense in depth -- if multiple
    // verification emails went out, only the one actually redeemed should
    // remain meaningful).
    await tx
      .update(emailVerificationTokensTable)
      .set({ usedAt: now })
      .where(
        and(
          eq(emailVerificationTokensTable.accountId, verificationToken.accountId),
          isNull(emailVerificationTokensTable.usedAt),
        ),
      );
  });

  res.json({ ok: true });
});

// POST /api/auth/resend-verification
// Authenticated + idempotent: a no-op with a friendly message if the caller
// is already verified, otherwise invalidates prior unused tokens and sends a
// fresh one. Unlike forgot-password, there's no email-enumeration concern
// (the caller is already proven to own this account via their JWT), so a
// send failure is reported directly instead of being swallowed.
router.post("/auth/resend-verification", requireAuth, resendVerificationLimiter, async (req, res) => {
  const [account] = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.personId, req.auth!.personId))
    .limit(1);

  if (!account) {
    res.status(404).json({ error: "Not found", message: "Account not found." });
    return;
  }

  if (account.emailVerifiedAt) {
    res.json({ message: "Your email is already verified." });
    return;
  }

  const now = new Date();
  await db
    .update(emailVerificationTokensTable)
    .set({ usedAt: now })
    .where(
      and(
        eq(emailVerificationTokensTable.accountId, account.id),
        isNull(emailVerificationTokensTable.usedAt),
      ),
    );

  const token = nanoid(32);
  await db.insert(emailVerificationTokensTable).values({
    accountId: account.id,
    token,
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
  });

  try {
    await sendVerificationEmail({ to: account.email, token });
  } catch (err) {
    console.error("Failed to send verification email:", err);
    res.status(502).json({ error: "Email failed", message: "Couldn't send the verification email. Please try again shortly." });
    return;
  }

  res.json({ message: "Verification email sent." });
});

export { formatPerson, formatUnit };
export default router;
