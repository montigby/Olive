import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { personsTable, familyUnitsTable, accountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

if (!process.env.SESSION_SECRET) {
  throw new Error(
    "SESSION_SECRET must be set. Did you forget to configure it in Vercel?",
  );
}
const JWT_SECRET = process.env.SESSION_SECRET;

export interface AuthPayload {
  personId: string;
  familyUnitId: string;
  isAdmin: boolean;
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, JWT_SECRET) as AuthPayload;
}

// A separate, narrow-purpose token family for the memory-prompt unsubscribe
// link (see routes/memories.ts) -- deliberately not an AuthPayload/session
// token: it identifies a (deceased person, recipient) pair, not a logged-in
// user, and is meant to work indefinitely from an email link with no login,
// so it carries no expiresIn. The `purpose` field stops it from being
// accepted anywhere a real AuthPayload is expected, even though both are
// signed with the same SESSION_SECRET.
interface MemoryPromptUnsubscribePayload {
  purpose: "memory-prompt-unsubscribe";
  personId: string;
  recipientPersonId: string;
}

export function signMemoryPromptUnsubscribeToken(
  personId: string,
  recipientPersonId: string,
): string {
  const payload: MemoryPromptUnsubscribePayload = {
    purpose: "memory-prompt-unsubscribe",
    personId,
    recipientPersonId,
  };
  return jwt.sign(payload, JWT_SECRET);
}

export function verifyMemoryPromptUnsubscribeToken(
  token: string,
): { personId: string; recipientPersonId: string } {
  const payload = jwt.verify(token, JWT_SECRET) as Partial<MemoryPromptUnsubscribePayload>;
  if (
    payload.purpose !== "memory-prompt-unsubscribe" ||
    typeof payload.personId !== "string" ||
    typeof payload.recipientPersonId !== "string"
  ) {
    throw new Error("Not a memory-prompt-unsubscribe token");
  }
  return { personId: payload.personId, recipientPersonId: payload.recipientPersonId };
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized", message: "Missing token" });
    return;
  }
  try {
    const token = header.slice(7);
    req.auth = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized", message: "Invalid token" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.auth?.isAdmin) {
    res.status(403).json({ error: "Forbidden", message: "Admin only" });
    return;
  }
  next();
}

export async function getPersonWithUnit(personId: string) {
  // Left-joined to accountsTable (not every person has an account -- unclaimed
  // invited members don't) so callers can also read emailVerifiedAt for the
  // authenticated caller's own record. Both current callers (login, /auth/me)
  // only ever look up an account-holder, but the left join keeps this safe
  // to reuse for a non-account-holder in the future too.
  const rows = await db
    .select()
    .from(personsTable)
    .innerJoin(familyUnitsTable, eq(personsTable.familyUnitId, familyUnitsTable.id))
    .leftJoin(accountsTable, eq(accountsTable.personId, personsTable.id))
    .where(eq(personsTable.id, personId));
  if (!rows.length) return null;
  const { persons, family_units, accounts } = rows[0];
  return { ...persons, familyUnit: family_units, emailVerifiedAt: accounts?.emailVerifiedAt ?? null };
}
