import { Router } from "express";
import { db, personsTable, memoriesTable, memoryPromptOptoutsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { describeRelationship } from "../lib/visibility";
import { sendMemoryPromptsForPerson } from "../lib/memoryPromptSender";

const router = Router();

const MAX_PHOTOS = 3;
const MAX_BODY_LENGTH = 4000;

// Only accept photos as inline data URIs, matching the only path the UI
// actually produces them through (client-side resize to a data: URL).
// Rejecting anything else stops a raw external URL from being stored and
// rendered as an <img src>, which would act as a tracking pixel against
// every family member who later views the memory -- the SPA's static HTML
// has no CSP to block that kind of cross-origin image load.
const DATA_IMAGE_URI = /^data:image\/[a-zA-Z0-9.+-]+;base64,/;

function validatePhotoUrls(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_PHOTOS) return null;
  if (!value.every((v) => typeof v === "string" && DATA_IMAGE_URI.test(v))) return null;
  return value;
}

// GET /api/persons/:personId/memories
// Visible to the whole family unit once published -- tier only gates who
// gets prompted to contribute, not who can read the result.
router.get("/persons/:personId/memories", requireAuth, async (req, res) => {
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

  if (req.auth!.familyUnitId !== target.familyUnitId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [members, memories] = await Promise.all([
    db.select().from(personsTable).where(eq(personsTable.familyUnitId, target.familyUnitId)),
    db
      .select()
      .from(memoriesTable)
      .where(eq(memoriesTable.personId, personId))
      .orderBy(desc(memoriesTable.createdAt)),
  ]);

  const membersById = new Map(members.map((m) => [m.id, m]));

  const result = memories.map((mem) => {
    const contributor = mem.contributorPersonId ? membersById.get(mem.contributorPersonId) : undefined;
    return {
      id: mem.id,
      personId: mem.personId,
      body: mem.body,
      photoUrls: mem.photoUrls,
      promptText: mem.promptText,
      createdAt: mem.createdAt.toISOString(),
      updatedAt: mem.updatedAt.toISOString(),
      contributorPersonId: mem.contributorPersonId,
      contributorName: contributor ? `${contributor.firstName} ${contributor.lastName}` : "A family member",
      contributorRelationship: contributor
        ? describeRelationship(req.auth!.personId, contributor.id, members)
        : null,
      canEdit: mem.contributorPersonId === req.auth!.personId,
      canDelete: mem.contributorPersonId === req.auth!.personId || req.auth!.isAdmin,
    };
  });

  res.json(result);
});

// POST /api/persons/:personId/memories
// Any family member can contribute once collection is enabled for this
// profile -- matches how every comparable product (FamilySearch Memories,
// ForeverMissed, Kudoboard) handles contribution: no relationship-tier gate.
router.post("/persons/:personId/memories", requireAuth, async (req, res) => {
  const personId = String(req.params.personId);

  const [target] = await db
    .select({
      id: personsTable.id,
      familyUnitId: personsTable.familyUnitId,
      memoryCollectionEnabled: personsTable.memoryCollectionEnabled,
    })
    .from(personsTable)
    .where(eq(personsTable.id, personId))
    .limit(1);

  if (!target) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (req.auth!.familyUnitId !== target.familyUnitId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (!target.memoryCollectionEnabled) {
    res.status(400).json({ error: "Bad request", message: "Memory collection isn't turned on for this profile yet." });
    return;
  }

  const body = req.body as { body?: unknown; photoUrls?: unknown; promptText?: unknown };
  const photoUrls = validatePhotoUrls(body.photoUrls);
  if (typeof body.body !== "string" || !body.body.trim() || body.body.length > MAX_BODY_LENGTH || photoUrls === null) {
    res.status(400).json({ error: "Validation error" });
    return;
  }
  if (body.promptText !== undefined && typeof body.promptText !== "string") {
    res.status(400).json({ error: "Validation error" });
    return;
  }

  const [created] = await db
    .insert(memoriesTable)
    .values({
      personId,
      familyUnitId: target.familyUnitId,
      contributorPersonId: req.auth!.personId,
      body: body.body.trim(),
      photoUrls,
      promptText: (body.promptText as string | undefined) ?? null,
    })
    .returning();

  res.status(201).json(created);
});

// PATCH /api/memories/:memoryId -- contributor only
router.patch("/memories/:memoryId", requireAuth, async (req, res) => {
  const memoryId = String(req.params.memoryId);

  const [memory] = await db.select().from(memoriesTable).where(eq(memoriesTable.id, memoryId)).limit(1);
  if (!memory) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (memory.contributorPersonId !== req.auth!.personId) {
    res.status(403).json({ error: "Forbidden", message: "You can only edit your own memory." });
    return;
  }

  const body = req.body as { body?: unknown; photoUrls?: unknown };
  const updateData: Partial<typeof memoriesTable.$inferInsert> = { updatedAt: new Date() };

  if (body.body !== undefined) {
    if (typeof body.body !== "string" || !body.body.trim() || body.body.length > MAX_BODY_LENGTH) {
      res.status(400).json({ error: "Validation error" });
      return;
    }
    updateData.body = body.body.trim();
  }
  if (body.photoUrls !== undefined) {
    const photoUrls = validatePhotoUrls(body.photoUrls);
    if (photoUrls === null) {
      res.status(400).json({ error: "Validation error" });
      return;
    }
    updateData.photoUrls = photoUrls;
  }

  const [updated] = await db
    .update(memoriesTable)
    .set(updateData)
    .where(eq(memoriesTable.id, memoryId))
    .returning();

  res.json(updated);
});

// DELETE /api/memories/:memoryId -- contributor or same-family admin. No
// pre-publish review queue exists (publish-as-submitted, per spec), so this
// after-the-fact removal right is the only moderation lever.
router.delete("/memories/:memoryId", requireAuth, async (req, res) => {
  const memoryId = String(req.params.memoryId);

  const [memory] = await db.select().from(memoriesTable).where(eq(memoriesTable.id, memoryId)).limit(1);
  if (!memory) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const isContributor = memory.contributorPersonId === req.auth!.personId;
  const isSameFamilyAdmin = req.auth!.isAdmin && req.auth!.familyUnitId === memory.familyUnitId;

  if (!isContributor && !isSameFamilyAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db.delete(memoriesTable).where(eq(memoriesTable.id, memoryId));
  res.json({ ok: true });
});

// POST /api/persons/:personId/memory-collection
// Turning collection ON is open to any family member in the unit (matches
// competitor norm, avoids the feature going dormant behind a bottleneck).
// Turning it OFF is admin-only -- asymmetric friction, same pattern as
// delete-person / admin grant-revoke.
router.post("/persons/:personId/memory-collection", requireAuth, async (req, res) => {
  const personId = String(req.params.personId);
  const { enabled } = req.body as { enabled?: unknown };

  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "Validation error", message: "enabled must be a boolean" });
    return;
  }

  const [target] = await db
    .select({
      id: personsTable.id,
      familyUnitId: personsTable.familyUnitId,
      deceased: personsTable.deceased,
    })
    .from(personsTable)
    .where(eq(personsTable.id, personId))
    .limit(1);

  if (!target) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (req.auth!.familyUnitId !== target.familyUnitId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (enabled) {
    if (!target.deceased) {
      res.status(400).json({ error: "Bad request", message: "Only a profile marked deceased can start memory collection." });
      return;
    }
  } else if (!req.auth!.isAdmin) {
    res.status(403).json({ error: "Forbidden", message: "Only an admin can turn off memory collection." });
    return;
  }

  const [updated] = await db
    .update(personsTable)
    .set({ memoryCollectionEnabled: enabled })
    .where(eq(personsTable.id, personId))
    .returning();

  // Fire the first prompt immediately rather than waiting for the next
  // cron sweep -- best-effort, never throws (see memoryPromptSender.ts).
  // Awaited (not fire-and-forget) because a serverless function isn't
  // guaranteed to keep running after it responds.
  if (enabled) {
    await sendMemoryPromptsForPerson(personId);
  }

  res.json({ id: updated.id, memoryCollectionEnabled: updated.memoryCollectionEnabled });
});

// POST /api/persons/:personId/memory-prompts/optout
// Self-only: a recipient stops future prompt emails about this one specific
// deceased person, without touching their global notification preference.
router.post("/persons/:personId/memory-prompts/optout", requireAuth, async (req, res) => {
  const personId = String(req.params.personId);

  await db
    .insert(memoryPromptOptoutsTable)
    .values({ personId, recipientPersonId: req.auth!.personId })
    .onConflictDoNothing();

  res.json({ ok: true });
});

export default router;
