import { Router } from "express";
import { db, personsTable, lifeEventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { canEditPerson, isParentOfPerson } from "../lib/permissions";
import type { LifeEvent } from "@workspace/db";

const router = Router();

export const VALID_EVENT_TYPES = new Set([
  "graduation",
  "marriage",
  "new_baby",
  "moved",
  "new_job",
  "death",
  "custom",
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateCreate(body: unknown): { eventType: string; eventDate: string; notes?: string | null } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.eventType !== "string" || !VALID_EVENT_TYPES.has(b.eventType)) return null;
  if (typeof b.eventDate !== "string" || !DATE_RE.test(b.eventDate)) return null;
  if (b.notes !== undefined && b.notes !== null && typeof b.notes !== "string") return null;
  if (typeof b.notes === "string" && b.notes.length > 500) return null;
  return { eventType: b.eventType, eventDate: b.eventDate, notes: (b.notes as string | null | undefined) };
}

function validateUpdate(body: unknown): { eventType?: string; eventDate?: string; notes?: string | null } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const result: { eventType?: string; eventDate?: string; notes?: string | null } = {};
  if (b.eventType !== undefined) {
    if (typeof b.eventType !== "string" || !VALID_EVENT_TYPES.has(b.eventType)) return null;
    result.eventType = b.eventType;
  }
  if (b.eventDate !== undefined) {
    if (typeof b.eventDate !== "string" || !DATE_RE.test(b.eventDate)) return null;
    result.eventDate = b.eventDate;
  }
  if (b.notes !== undefined) {
    if (b.notes !== null && typeof b.notes !== "string") return null;
    if (typeof b.notes === "string" && b.notes.length > 500) return null;
    result.notes = b.notes as string | null;
  }
  return result;
}

// GET /api/persons/:personId/life-events
router.get("/persons/:personId/life-events", requireAuth, async (req, res) => {
  const personId = String(req.params.personId);

  const [target] = await db
    .select({ id: personsTable.id, familyUnitId: personsTable.familyUnitId })
    .from(personsTable)
    .where(eq(personsTable.id, personId))
    .limit(1);

  if (!target) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [viewer] = await db
    .select({ familyUnitId: personsTable.familyUnitId })
    .from(personsTable)
    .where(eq(personsTable.id, req.auth!.personId))
    .limit(1);

  if (!viewer || viewer.familyUnitId !== target.familyUnitId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const events = await db
    .select()
    .from(lifeEventsTable)
    .where(eq(lifeEventsTable.personId, personId));

  events.sort((a: LifeEvent, b: LifeEvent) => a.eventDate.localeCompare(b.eventDate));

  res.json(events);
});

// POST /api/persons/:personId/life-events
router.post("/persons/:personId/life-events", requireAuth, async (req, res) => {
  const personId = String(req.params.personId);

  const [target] = await db
    .select({ id: personsTable.id, familyUnitId: personsTable.familyUnitId })
    .from(personsTable)
    .where(eq(personsTable.id, personId))
    .limit(1);

  if (!target) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (!(await canEditPerson(req.auth!, target))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = validateCreate(req.body);
  if (!parsed) {
    res.status(400).json({ error: "Validation error" });
    return;
  }

  const [created] = await db
    .insert(lifeEventsTable)
    .values({
      familyId: target.familyUnitId,
      personId,
      eventType: parsed.eventType,
      eventDate: parsed.eventDate,
      notes: parsed.notes ?? null,
      createdBy: req.auth!.personId,
    })
    .returning();

  res.status(201).json(created);
});

// PATCH /api/life-events/:eventId
router.patch("/life-events/:eventId", requireAuth, async (req, res) => {
  const eventId = String(req.params.eventId);

  const [event] = await db
    .select()
    .from(lifeEventsTable)
    .where(eq(lifeEventsTable.id, eventId))
    .limit(1);

  if (!event) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const isCreator = event.createdBy === req.auth!.personId;
  const isSameFamilyAdmin = req.auth!.isAdmin && req.auth!.familyUnitId === event.familyId;
  const isParentOfSubject =
    !isCreator && !isSameFamilyAdmin && req.auth!.familyUnitId === event.familyId &&
    (await isParentOfPerson(req.auth!.personId, event.personId, event.familyId));

  if (!isCreator && !isSameFamilyAdmin && !isParentOfSubject) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = validateUpdate(req.body);
  if (!parsed) {
    res.status(400).json({ error: "Validation error" });
    return;
  }

  const [updated] = await db
    .update(lifeEventsTable)
    .set({
      ...(parsed.eventType !== undefined && { eventType: parsed.eventType }),
      ...(parsed.eventDate !== undefined && { eventDate: parsed.eventDate }),
      ...(parsed.notes !== undefined && { notes: parsed.notes }),
    })
    .where(eq(lifeEventsTable.id, eventId))
    .returning();

  res.json(updated);
});

// DELETE /api/life-events/:eventId
router.delete("/life-events/:eventId", requireAuth, async (req, res) => {
  const eventId = String(req.params.eventId);

  const [event] = await db
    .select()
    .from(lifeEventsTable)
    .where(eq(lifeEventsTable.id, eventId))
    .limit(1);

  if (!event) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const isCreator = event.createdBy === req.auth!.personId;
  const isSameFamilyAdmin = req.auth!.isAdmin && req.auth!.familyUnitId === event.familyId;
  const isParentOfSubject =
    !isCreator && !isSameFamilyAdmin && req.auth!.familyUnitId === event.familyId &&
    (await isParentOfPerson(req.auth!.personId, event.personId, event.familyId));

  if (!isCreator && !isSameFamilyAdmin && !isParentOfSubject) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db.delete(lifeEventsTable).where(eq(lifeEventsTable.id, eventId));

  res.json({ ok: true });
});

export default router;
