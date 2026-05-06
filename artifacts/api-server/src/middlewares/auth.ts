import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { personsTable, familyUnitsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.SESSION_SECRET || "fallback-dev-secret";

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
  const rows = await db
    .select()
    .from(personsTable)
    .innerJoin(familyUnitsTable, eq(personsTable.familyUnitId, familyUnitsTable.id))
    .where(eq(personsTable.id, personId));
  if (!rows.length) return null;
  const { persons, family_units } = rows[0];
  return { ...persons, familyUnit: family_units };
}
