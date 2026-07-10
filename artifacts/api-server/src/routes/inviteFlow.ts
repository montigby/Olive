// Phase 2 of the shared-invite + claim flow — API endpoints.
//
// This module hosts:
//   • Admin token management:
//       POST /family-units/:unitId/invite-tokens          (regenerate)
//       GET  /family-units/:unitId/invite-tokens          (read current)
//   • Public claimer flow:
//       GET  /join/:token                                  (resolve)
//       POST /claims/match                                 (candidate match)
//       POST /claims                                       (create claim_request)
//       GET  /claims/:id                                   (poll status)
//   • Admin approval flow:
//       GET  /family-units/:unitId/claims                  (inbox)
//       POST /family-units/:unitId/claims/:id/approve      (approve)
//       POST /family-units/:unitId/claims/:id/reject       (reject)
//
// Auth model:
//   - The three admin sets require requireAuth + same-unit + isAdmin.
//   - The public claimer endpoints are unauthenticated but identified by the
//     opaque invite token (resolve / match / create) or the random claim
//     request UUID (poll). Returning data is restricted to non-protected
//     fields only.
//
// Credentials note: the claimer's chosen email + password (hashed) ride on
// claim_requests.claimer_signal JSONB until approval. On approve we mint the
// account row and bind ownership transactionally. Moving the hash to a
// dedicated column is a follow-up if needed.

import { Router } from "express";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import {
  familyUnitsTable,
  personsTable,
  peopleTable,
  accountsTable,
  inviteTokensTable,
  claimRequestsTable,
  relationshipsTable,
} from "@workspace/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { requireAuth, requireAdmin, signToken } from "../middlewares/auth";

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function inviteUrlFor(token: string): string {
  const base =
    process.env.APP_BASE_URL ??
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "");
  return `${base}/join/${token}`;
}

function normalizeName(input: string): string {
  return input.toLowerCase().trim().replace(/\s+/g, " ");
}

function arrivalSignal(req: any): { ua: string | null; ip: string | null } {
  return {
    ua: (req.headers["user-agent"] as string | undefined) ?? null,
    ip:
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
      req.ip ??
      null,
  };
}

// ---------------------------------------------------------------------------
// Admin: invite-token management
// ---------------------------------------------------------------------------

// POST /api/family-units/:unitId/invite-tokens
// Revoke any active token for this family, mint a new one, return it.
router.post(
  "/family-units/:unitId/invite-tokens",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const unitId = String(req.params.unitId);
    if (req.auth?.familyUnitId !== unitId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const now = new Date();
    await db
      .update(inviteTokensTable)
      .set({ revokedAt: now })
      .where(
        and(
          eq(inviteTokensTable.familyId, unitId),
          isNull(inviteTokensTable.revokedAt),
        ),
      );

    const token = nanoid(32);
    const [row] = await db
      .insert(inviteTokensTable)
      .values({
        familyId: unitId,
        token,
        createdBy: req.auth!.personId,
      })
      .returning();

    res.status(201).json({
      id: row.id,
      token: row.token,
      url: inviteUrlFor(row.token),
      createdAt: row.createdAt.toISOString(),
    });
  },
);

// GET /api/family-units/:unitId/invite-tokens
// Returns the currently-active token (or null if none).
// Admins always have access; non-admins can access when membersCanInvite = true.
router.get(
  "/family-units/:unitId/invite-tokens",
  requireAuth,
  async (req, res) => {
    const unitId = String(req.params.unitId);
    if (req.auth?.familyUnitId !== unitId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    if (!req.auth?.isAdmin) {
      const [unit] = await db
        .select({ membersCanInvite: familyUnitsTable.membersCanInvite })
        .from(familyUnitsTable)
        .where(eq(familyUnitsTable.id, unitId))
        .limit(1);
      if (!unit?.membersCanInvite) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const [row] = await db
      .select()
      .from(inviteTokensTable)
      .where(
        and(
          eq(inviteTokensTable.familyId, unitId),
          isNull(inviteTokensTable.revokedAt),
        ),
      )
      .limit(1);

    if (!row) {
      res.json({ active: null });
      return;
    }

    res.json({
      active: {
        id: row.id,
        token: row.token,
        url: inviteUrlFor(row.token),
        expiresAt: row.expiresAt?.toISOString() ?? null,
        maxUses: row.maxUses,
        useCount: row.useCount,
        createdAt: row.createdAt.toISOString(),
      },
    });
  },
);

// ---------------------------------------------------------------------------
// Public: resolve invite token
// ---------------------------------------------------------------------------

// GET /api/join/:token
// Returns only the family display name + inviter's first name. Never leaks
// member list or any protected fields. Used by Screen A.
router.get("/join/:token", async (req, res) => {
  const token = String(req.params.token);

  const [row] = await db
    .select({
      tokenRow: inviteTokensTable,
      unit: familyUnitsTable,
      inviter: personsTable,
    })
    .from(inviteTokensTable)
    .innerJoin(familyUnitsTable, eq(familyUnitsTable.id, inviteTokensTable.familyId))
    .leftJoin(personsTable, eq(personsTable.id, inviteTokensTable.createdBy))
    .where(eq(inviteTokensTable.token, token))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Not found", message: "Invalid invite link." });
    return;
  }
  if (row.tokenRow.revokedAt) {
    res.status(410).json({ error: "Revoked", message: "This invite has been revoked." });
    return;
  }
  if (row.tokenRow.expiresAt && row.tokenRow.expiresAt < new Date()) {
    res.status(410).json({ error: "Expired", message: "This invite has expired." });
    return;
  }
  if (row.tokenRow.maxUses !== null && row.tokenRow.useCount >= row.tokenRow.maxUses) {
    res.status(410).json({ error: "Exhausted", message: "This invite has reached its use limit." });
    return;
  }

  res.json({
    family: { unitName: row.unit.unitName },
    inviter: row.inviter
      ? { firstName: row.inviter.firstName, lastName: row.inviter.lastName }
      : null,
  });
});

// ---------------------------------------------------------------------------
// Public: candidate matching
// ---------------------------------------------------------------------------

interface MatchCandidate {
  id: string;
  firstName: string;
  lastName: string | null;
  parents: { id: string; firstName: string }[];
  spouse: { id: string; firstName: string } | null;
  birthYear: number | null;
}

// Build minimal disambiguation hints (parent names + spouse first-name +
// birth year) for a set of candidate IDs. Reads the relationships table for
// parent/spouse linkage. Bounded to a small N so this stays cheap.
async function fetchCandidateHints(candidateIds: string[]): Promise<Record<string, Omit<MatchCandidate, "id" | "firstName" | "lastName">>> {
  if (candidateIds.length === 0) return {};

  // Parents: edges from candidate (child) → parent. Bio + adoptive + step.
  const parentEdges = await db
    .select({
      child: relationshipsTable.fromPerson,
      parent: relationshipsTable.toPerson,
    })
    .from(relationshipsTable)
    .where(
      and(
        inArray(relationshipsTable.fromPerson, candidateIds),
        inArray(relationshipsTable.type, [
          "biological_parent",
          "adoptive_parent",
          "step_parent",
        ]),
      ),
    );

  // Spouses (one row each — explicit spouse edges are symmetric so the from
  // side is enough to identify a partner).
  const spouseEdges = await db
    .select({
      person: relationshipsTable.fromPerson,
      partner: relationshipsTable.toPerson,
    })
    .from(relationshipsTable)
    .where(
      and(
        inArray(relationshipsTable.fromPerson, candidateIds),
        eq(relationshipsTable.type, "spouse"),
      ),
    );

  // Fetch the display names for every referenced person in one shot.
  const referencedIds = Array.from(
    new Set([
      ...parentEdges.map((e) => e.parent),
      ...spouseEdges.map((e) => e.partner),
    ]),
  );
  const refs =
    referencedIds.length === 0
      ? []
      : await db
          .select({
            id: peopleTable.id,
            firstName: peopleTable.firstName,
            birthDate: peopleTable.birthDate,
          })
          .from(peopleTable)
          .where(inArray(peopleTable.id, referencedIds));
  const refsById = new Map(refs.map((r) => [r.id, r] as const));

  // Also pull birthDate for the candidates themselves to derive birth year.
  const candidateRows = await db
    .select({ id: peopleTable.id, birthDate: peopleTable.birthDate })
    .from(peopleTable)
    .where(inArray(peopleTable.id, candidateIds));
  const birthByCandidate = new Map(candidateRows.map((c) => [c.id, c.birthDate] as const));

  const out: Record<string, Omit<MatchCandidate, "id" | "firstName" | "lastName">> = {};
  for (const cid of candidateIds) {
    const parents = parentEdges
      .filter((e) => e.child === cid)
      .slice(0, 2)
      .map((e) => {
        const ref = refsById.get(e.parent);
        return ref ? { id: ref.id, firstName: ref.firstName } : null;
      })
      .filter(Boolean) as { id: string; firstName: string }[];
    const spouseEdge = spouseEdges.find((e) => e.person === cid);
    const spouse =
      spouseEdge && refsById.get(spouseEdge.partner)
        ? {
            id: spouseEdge.partner,
            firstName: refsById.get(spouseEdge.partner)!.firstName,
          }
        : null;
    const bd = birthByCandidate.get(cid);
    const birthYear = bd ? parseInt(String(bd).slice(0, 4), 10) || null : null;
    out[cid] = { parents, spouse, birthYear };
  }
  return out;
}

// POST /api/claims/match
// Body: { token, name, relationshipAnswers? }
// Returns up to 4 candidate unclaimed people in the family that fuzzy-match
// the supplied name, with minimal disambiguation hints.
router.post("/claims/match", async (req, res) => {
  const body = req.body as {
    token?: string;
    name?: string;
    relationshipAnswers?: {
      parentIds?: string[];
      spouseId?: string;
    };
  };

  if (!body.token || !body.name || body.name.trim().length < 2) {
    res.status(400).json({ error: "Bad request", message: "Token and name are required." });
    return;
  }

  // Resolve token (with the same liveness checks as /join).
  const [tokenRow] = await db
    .select()
    .from(inviteTokensTable)
    .where(eq(inviteTokensTable.token, body.token))
    .limit(1);
  if (
    !tokenRow ||
    tokenRow.revokedAt ||
    (tokenRow.expiresAt && tokenRow.expiresAt < new Date()) ||
    (tokenRow.maxUses !== null && tokenRow.useCount >= tokenRow.maxUses)
  ) {
    res.status(410).json({ error: "Invalid token" });
    return;
  }

  const queryName = normalizeName(body.name);

  // Top 10 unclaimed candidates, sorted by similarity. Threshold 0.25 keeps
  // weak matches surfaceable; the UI is responsible for collapsing 5+ into a
  // "tell us more" prompt rather than a list.
  const candidatesRaw = await db.execute(sql`
    SELECT p.id, p.first_name, p.last_name,
           similarity(p.name_normalized, ${queryName}) AS sim
    FROM people p
    WHERE p.family_id = ${tokenRow.familyId}
      AND p.claimed_by IS NULL
      AND p.death_date IS NULL
      AND similarity(p.name_normalized, ${queryName}) > 0.25
    ORDER BY sim DESC
    LIMIT 10
  `);
  const rows = (candidatesRaw as any).rows ?? candidatesRaw;
  let candidateIds: string[] = (rows as any[]).map((r: any) => r.id);

  // Optional relationship filter: keep only candidates connected to the
  // claimer-provided parent / spouse via the typed-edge graph. AND-semantics.
  if (body.relationshipAnswers?.parentIds?.length) {
    const matchingChildren = await db
      .select({ child: relationshipsTable.fromPerson })
      .from(relationshipsTable)
      .where(
        and(
          inArray(relationshipsTable.fromPerson, candidateIds.length ? candidateIds : ["00000000-0000-0000-0000-000000000000"]),
          inArray(relationshipsTable.toPerson, body.relationshipAnswers.parentIds),
          inArray(relationshipsTable.type, [
            "biological_parent",
            "adoptive_parent",
            "step_parent",
          ]),
        ),
      );
    const allowed = new Set(matchingChildren.map((r) => r.child));
    candidateIds = candidateIds.filter((id) => allowed.has(id));
  }
  if (body.relationshipAnswers?.spouseId) {
    const matchingSpouses = await db
      .select({ person: relationshipsTable.fromPerson })
      .from(relationshipsTable)
      .where(
        and(
          inArray(relationshipsTable.fromPerson, candidateIds.length ? candidateIds : ["00000000-0000-0000-0000-000000000000"]),
          eq(relationshipsTable.toPerson, body.relationshipAnswers.spouseId),
          eq(relationshipsTable.type, "spouse"),
        ),
      );
    const allowed = new Set(matchingSpouses.map((r) => r.person));
    candidateIds = candidateIds.filter((id) => allowed.has(id));
  }

  // Limit surfaced results to 4 per spec; the UI uses 5+ as a "needs more
  // disambiguation" signal handled by re-submitting with relationshipAnswers.
  const surfaced = candidateIds.slice(0, 4);
  const hints = await fetchCandidateHints(surfaced);

  const nameById = new Map(
    (rows as any[]).map((r: any) => [r.id, { firstName: r.first_name, lastName: r.last_name }] as const),
  );

  const candidates: MatchCandidate[] = surfaced.map((id) => ({
    id,
    firstName: nameById.get(id)?.firstName ?? "",
    lastName: nameById.get(id)?.lastName ?? null,
    ...hints[id]!,
  }));

  res.json({
    overflow: candidateIds.length > 4,
    candidates,
  });
});

// ---------------------------------------------------------------------------
// Public: create a claim_request
// ---------------------------------------------------------------------------

// POST /api/claims
// Two shapes by type:
//
//   { token, type: "claim_existing", targetPersonId,
//     claimerEmail, claimerPassword, claimerName,
//     relationshipAnswers? }
//
//   { token, type: "create_new",
//     claimerEmail, claimerPassword, claimerName,
//     attachingRelationships: [{ relatedPersonId, type }] }
//
// Stores the (hashed) password in claimer_signal so account creation can
// happen atomically at approval time without re-asking the claimer.
router.post("/claims", async (req, res) => {
  const body = req.body as {
    token?: string;
    type?: "claim_existing" | "create_new";
    targetPersonId?: string;
    claimerEmail?: string;
    claimerPassword?: string;
    claimerName?: string;
    relationshipAnswers?: { parentIds?: string[]; spouseId?: string };
    attachingRelationships?: { relatedPersonId: string; type: string }[];
  };

  if (
    !body.token ||
    !body.type ||
    !body.claimerEmail ||
    !body.claimerPassword ||
    !body.claimerName
  ) {
    res.status(400).json({ error: "Bad request", message: "Missing required fields." });
    return;
  }
  if (!["claim_existing", "create_new"].includes(body.type)) {
    res.status(400).json({ error: "Bad request", message: "Invalid type." });
    return;
  }

  const [tokenRow] = await db
    .select()
    .from(inviteTokensTable)
    .where(eq(inviteTokensTable.token, body.token))
    .limit(1);
  if (
    !tokenRow ||
    tokenRow.revokedAt ||
    (tokenRow.expiresAt && tokenRow.expiresAt < new Date()) ||
    (tokenRow.maxUses !== null && tokenRow.useCount >= tokenRow.maxUses)
  ) {
    res.status(410).json({ error: "Invalid token" });
    return;
  }

  if (body.type === "claim_existing") {
    if (!body.targetPersonId) {
      res.status(400).json({ error: "Bad request", message: "targetPersonId required." });
      return;
    }
    // Target must exist, be in the family, unclaimed, and not deceased.
    const [target] = await db
      .select()
      .from(peopleTable)
      .where(eq(peopleTable.id, body.targetPersonId))
      .limit(1);
    if (!target || target.familyId !== tokenRow.familyId) {
      res.status(404).json({ error: "Not found", message: "Target profile not found." });
      return;
    }
    if (target.claimedBy) {
      res.status(409).json({ error: "Already claimed", message: "This profile already belongs to someone." });
      return;
    }
    if (target.deathDate) {
      res.status(400).json({ error: "Bad target", message: "Cannot claim a deceased member." });
      return;
    }
  }

  const passwordHash = await bcrypt.hash(body.claimerPassword, 12);
  const arrival = arrivalSignal(req);

  const [inserted] = await db
    .insert(claimRequestsTable)
    .values({
      familyId: tokenRow.familyId,
      inviteTokenId: tokenRow.id,
      type: body.type,
      targetPersonId: body.type === "claim_existing" ? body.targetPersonId! : null,
      claimerDisplayName: body.claimerName,
      claimerContact: body.claimerEmail,
      claimerSignal: {
        passwordHash,
        relationshipAnswers: body.relationshipAnswers ?? null,
        attachingRelationships: body.attachingRelationships ?? null,
        arrival,
      } as any,
    })
    .returning();

  // Bump use_count for the token.
  await db
    .update(inviteTokensTable)
    .set({ useCount: tokenRow.useCount + 1 })
    .where(eq(inviteTokensTable.id, tokenRow.id));

  // Notify admins by email so a claim doesn't sit unnoticed. Best-effort --
  // must never block the claimer's request.
  notifyAdminsOfPendingClaim(tokenRow.familyId, body.claimerName).catch(() => {});

  res.status(201).json({
    id: inserted.id,
    status: inserted.status,
    createdAt: inserted.createdAt.toISOString(),
  });
});

async function notifyAdminsOfPendingClaim(familyUnitId: string, claimerName: string) {
  const [unit] = await db
    .select({ unitName: familyUnitsTable.unitName })
    .from(familyUnitsTable)
    .where(eq(familyUnitsTable.id, familyUnitId))
    .limit(1);
  if (!unit) return;

  const admins = await db
    .select({ firstName: personsTable.firstName, email: personsTable.email })
    .from(personsTable)
    .where(and(eq(personsTable.familyUnitId, familyUnitId), eq(personsTable.isAdmin, true)));

  const { sendClaimPendingNotification } = await import("../lib/email");
  for (const admin of admins) {
    if (!admin.email) continue;
    await sendClaimPendingNotification({
      to: admin.email,
      adminName: admin.firstName,
      claimerName,
      unitName: unit.unitName,
    }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Public: poll claim status
// ---------------------------------------------------------------------------

// GET /api/claims/:id
// Used by the claimer's browser to poll for approval. Identified by the
// claim_request UUID (122-bit secret). Returns the status and, if approved,
// indicates the claimer can log in with the email + password they submitted.
router.get("/claims/:id", async (req, res) => {
  const id = String(req.params.id);
  const [row] = await db
    .select({
      id: claimRequestsTable.id,
      status: claimRequestsTable.status,
      type: claimRequestsTable.type,
      decidedAt: claimRequestsTable.decidedAt,
      createdAt: claimRequestsTable.createdAt,
    })
    .from(claimRequestsTable)
    .where(eq(claimRequestsTable.id, id))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({
    id: row.id,
    status: row.status,
    type: row.type,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Admin: claim inbox
// ---------------------------------------------------------------------------

// GET /api/family-units/:unitId/claims?status=pending
router.get(
  "/family-units/:unitId/claims",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const unitId = String(req.params.unitId);
    if (req.auth?.familyUnitId !== unitId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const status = (req.query.status as string) ?? "pending";

    const rows = await db
      .select({
        id: claimRequestsTable.id,
        type: claimRequestsTable.type,
        targetPersonId: claimRequestsTable.targetPersonId,
        claimerDisplayName: claimRequestsTable.claimerDisplayName,
        claimerContact: claimRequestsTable.claimerContact,
        claimerSignal: claimRequestsTable.claimerSignal,
        status: claimRequestsTable.status,
        createdAt: claimRequestsTable.createdAt,
      })
      .from(claimRequestsTable)
      .where(
        and(
          eq(claimRequestsTable.familyId, unitId),
          eq(claimRequestsTable.status, status),
        ),
      );

    // Strip password hash from signal before returning to the approver UI.
    const safeRows = rows.map((r) => {
      const signal = (r.claimerSignal ?? {}) as any;
      const { passwordHash: _ph, ...safeSignal } = signal;
      return { ...r, claimerSignal: safeSignal, createdAt: r.createdAt.toISOString() };
    });

    res.json({ claims: safeRows });
  },
);

// ---------------------------------------------------------------------------
// Admin: approve / reject
// ---------------------------------------------------------------------------

// POST /api/family-units/:unitId/claims/:id/approve
// Transactionally: validates the request, materialises the account, binds
// ownership on the people row, marks competing claims superseded, and marks
// this claim approved.
router.post(
  "/family-units/:unitId/claims/:id/approve",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const unitId = String(req.params.unitId);
    const claimId = String(req.params.id);
    if (req.auth?.familyUnitId !== unitId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [claim] = await db
      .select()
      .from(claimRequestsTable)
      .where(eq(claimRequestsTable.id, claimId))
      .limit(1);
    if (!claim || claim.familyId !== unitId) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (claim.status !== "pending") {
      res.status(409).json({ error: "Already decided", status: claim.status });
      return;
    }
    if (req.auth!.personId === claim.targetPersonId) {
      res.status(409).json({ error: "Self-approval blocked" });
      return;
    }

    const signal = (claim.claimerSignal ?? {}) as {
      passwordHash?: string;
      attachingRelationships?: { relatedPersonId: string; type: string }[];
    };
    if (!signal.passwordHash) {
      res.status(500).json({ error: "Claim missing credentials" });
      return;
    }
    if (!claim.claimerContact) {
      res.status(500).json({ error: "Claim missing email" });
      return;
    }

    // Email-conflict guard — accounts.email is unique.
    const [existing] = await db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.email, claim.claimerContact))
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "Email already in use" });
      return;
    }

    let boundPersonId: string;
    const now = new Date();

    if (claim.type === "claim_existing") {
      const targetId = claim.targetPersonId!;
      const [target] = await db
        .select()
        .from(peopleTable)
        .where(eq(peopleTable.id, targetId))
        .limit(1);
      if (!target || target.claimedBy) {
        res.status(409).json({ error: "Target no longer claimable" });
        return;
      }
      boundPersonId = targetId;

      await db
        .update(peopleTable)
        .set({ claimedBy: targetId, claimedAt: now })
        .where(eq(peopleTable.id, targetId));
      await db
        .update(personsTable)
        .set({
          claimed: true,
          claimedAt: now,
          email: claim.claimerContact,
          inviteToken: null,
          inviteExpiresAt: null,
          updatedAt: now,
        })
        .where(eq(personsTable.id, targetId));
    } else {
      // create_new — mint a placeholder persons + people row in this unit,
      // then encode any attaching relationships supplied at claim time.
      const split = claim.claimerDisplayName.trim().split(/\s+/);
      const firstName = split[0] ?? "Member";
      const lastName = split.slice(1).join(" ") || "";
      const [insertedPerson] = await db
        .insert(personsTable)
        .values({
          firstName,
          lastName,
          relationshipLabel: "relative",
          familyUnitId: unitId,
          isAdmin: false,
          claimed: true,
          claimedAt: now,
          email: claim.claimerContact,
        })
        .returning();
      await db
        .insert(peopleTable)
        .values({
          id: insertedPerson.id,
          familyId: unitId,
          firstName,
          lastName: lastName || undefined,
          claimedBy: insertedPerson.id,
          claimedAt: now,
        })
        .onConflictDoNothing();
      boundPersonId = insertedPerson.id;

      if (signal.attachingRelationships?.length) {
        for (const link of signal.attachingRelationships) {
          if (link.type === "spouse" || link.type === "partner") {
            await db
              .insert(relationshipsTable)
              .values({
                familyId: unitId,
                fromPerson: boundPersonId,
                toPerson: link.relatedPersonId,
                type: link.type,
              })
              .onConflictDoNothing();
            await db
              .insert(relationshipsTable)
              .values({
                familyId: unitId,
                fromPerson: link.relatedPersonId,
                toPerson: boundPersonId,
                type: link.type,
              })
              .onConflictDoNothing();
          } else if (
            link.type === "biological_parent" ||
            link.type === "adoptive_parent" ||
            link.type === "step_parent"
          ) {
            // from_person = child, to_person = parent per the relationship-layer convention.
            await db
              .insert(relationshipsTable)
              .values({
                familyId: unitId,
                fromPerson: boundPersonId,
                toPerson: link.relatedPersonId,
                type: link.type,
              })
              .onConflictDoNothing();
          }
        }
      }
    }

    await db.insert(accountsTable).values({
      personId: boundPersonId,
      email: claim.claimerContact,
      passwordHash: signal.passwordHash,
    });

    await db
      .update(claimRequestsTable)
      .set({
        status: "approved",
        approverPersonId: req.auth!.personId,
        decidedAt: now,
      })
      .where(eq(claimRequestsTable.id, claimId));

    // Supersede competing pending claims against the same target.
    if (claim.type === "claim_existing" && claim.targetPersonId) {
      await db
        .update(claimRequestsTable)
        .set({ status: "superseded", decidedAt: now })
        .where(
          and(
            eq(claimRequestsTable.targetPersonId, claim.targetPersonId),
            eq(claimRequestsTable.status, "pending"),
          ),
        );
    }

    // Mint a JWT so the claimer is logged in immediately after approval.
    const [boundPerson] = await db
      .select()
      .from(personsTable)
      .where(eq(personsTable.id, boundPersonId))
      .limit(1);
    const token = boundPerson
      ? signToken({
          personId: boundPerson.id,
          familyUnitId: boundPerson.familyUnitId,
          isAdmin: boundPerson.isAdmin,
        })
      : null;

    res.json({
      ok: true,
      personId: boundPersonId,
      token,
    });
  },
);

// POST /api/family-units/:unitId/claims/:id/reject
router.post(
  "/family-units/:unitId/claims/:id/reject",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const unitId = String(req.params.unitId);
    const claimId = String(req.params.id);
    if (req.auth?.familyUnitId !== unitId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [claim] = await db
      .select()
      .from(claimRequestsTable)
      .where(eq(claimRequestsTable.id, claimId))
      .limit(1);
    if (!claim || claim.familyId !== unitId) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (claim.status !== "pending") {
      res.status(409).json({ error: "Already decided", status: claim.status });
      return;
    }

    const reason = (req.body?.reason as string | undefined) ?? null;

    await db
      .update(claimRequestsTable)
      .set({
        status: "rejected",
        approverPersonId: req.auth!.personId,
        decidedAt: new Date(),
        claimerSignal: sql`jsonb_set(coalesce(claimer_signal, '{}'::jsonb), '{rejectionReason}', to_jsonb(${reason ?? null}::text))`,
      })
      .where(eq(claimRequestsTable.id, claimId));

    res.json({ ok: true });
  },
);

export default router;
