import { Router } from "express";
import { db, personsTable, familyUnitsTable, relationshipsTable, lifeEventsTable } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { computeVisibleSet } from "../lib/visibility";
import { computeProfileCompleteness } from "../lib/profileCompleteness";

const router = Router();

const BIRTHDAY_PLACEHOLDER_YEAR = 2000;

// Keep in sync with EVENT_TYPE_LABELS in artifacts/family-branch/src/pages/profile.tsx.
const EVENT_TYPE_LABEL: Record<string, string> = {
  graduation: "Graduation",
  marriage: "Marriage",
  new_baby: "New Baby",
  moved: "Moved",
  new_job: "New Job",
  death: "Passing",
  custom: "Life Update",
};

// Returns daysUntil the next occurrence of this birthday (0 = today).
function daysUntilBirthday(birthday: string): number {
  const parts = birthday.split("-");
  const month = parseInt(parts[1]!, 10);
  const day = parseInt(parts[2]!, 10);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(today.getFullYear(), month - 1, day);
  if (next.getTime() < today.getTime()) {
    next = new Date(today.getFullYear() + 1, month - 1, day);
  }
  return Math.round((next.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

// GET /api/family-units/:unitId/home-feed
// Returns all data needed for the post-invite welcome / home-feed screen in a
// single round-trip: profile completeness, upcoming birthdays, at-a-glance
// stats, and recent member activity.
router.get("/family-units/:unitId/home-feed", requireAuth, async (req, res) => {
  const unitId = String(req.params.unitId);

  if (req.auth?.familyUnitId !== unitId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const requesterId = req.auth!.personId;

  const [allMembers, units] = await Promise.all([
    db.select().from(personsTable).where(eq(personsTable.familyUnitId, unitId)),
    db.select().from(familyUnitsTable).where(eq(familyUnitsTable.id, unitId)).limit(1),
  ]);

  const unit = units[0];
  if (!unit) {
    res.status(404).json({ error: "Unit not found" });
    return;
  }

  const viewer = allMembers.find((m) => m.id === requesterId);
  if (!viewer) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  // Apply social-graph visibility so the welcome dashboard only surfaces
  // members the viewer is actually allowed to see. Without this, every viewer
  // sees the whole unit's birthdays / activity / contact counts, including
  // people on the other side of the admin-spouse bridge (e.g. James sees
  // Miranda's nieces). Admin gets tier 0 to everyone → no filtering.
  const relationships = viewer.isAdmin
    ? []
    : await db
        .select({
          fromPerson: relationshipsTable.fromPerson,
          toPerson: relationshipsTable.toPerson,
          type: relationshipsTable.type,
        })
        .from(relationshipsTable)
        .where(eq(relationshipsTable.familyId, unitId));

  const visibleSet = computeVisibleSet(viewer, allMembers, relationships);
  const isVisible = (memberId: string) => (visibleSet.get(memberId) ?? 4) <= 2;
  const visibleMembers = allMembers.filter((m) => isVisible(m.id));

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const currentMonth = now.getMonth() + 1; // 1–12

  // ── Profile completeness ──────────────────────────────────────────────────
  const { profileCompleteness, missingPriorityField } = computeProfileCompleteness(viewer);

  // ── Upcoming birthdays ────────────────────────────────────────────────────
  // Show birthdays within the next 30 days, plus any that happened in the
  // past 7 days (daysUntil >= 358). Upcoming entries sort first (0→30),
  // then recent-past sorted by most recent (364→358).
  const upcomingBirthdays = visibleMembers
    .filter((m) => !!m.birthday && !m.deceased)
    .map((m) => {
      const parts = m.birthday!.split("-");
      const birthYear = parseInt(parts[0]!, 10);
      const birthMonth = parseInt(parts[1]!, 10);
      const birthDay = parseInt(parts[2]!, 10);
      const daysUntil = daysUntilBirthday(m.birthday!);

      const realBirthYear = birthYear !== BIRTHDAY_PLACEHOLDER_YEAR ? birthYear : null;
      const thisYearBirthday = new Date(today.getFullYear(), birthMonth - 1, birthDay);
      const yearTurning = thisYearBirthday >= today ? today.getFullYear() : today.getFullYear() + 1;
      const ageTurning = realBirthYear && m.showBirthYear
        ? yearTurning - realBirthYear
        : null;

      return {
        memberId: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        avatarUrl: m.photoUrl ?? null,
        initials: ((m.firstName[0] ?? "?") + (m.lastName[0] ?? "?")).toUpperCase(),
        birthMonth,
        birthDay,
        daysUntil,
        ageTurning,
        phone: m.phone ?? null,
        email: m.email ?? null,
      };
    })
    .filter((m) => m.daysUntil <= 30 || m.daysUntil >= 358)
    .sort((a, b) => {
      const aUpcoming = a.daysUntil <= 30;
      const bUpcoming = b.daysUntil <= 30;
      if (aUpcoming && !bUpcoming) return -1;
      if (!aUpcoming && bUpcoming) return 1;
      if (aUpcoming) return a.daysUntil - b.daysUntil;
      return b.daysUntil - a.daysUntil; // recent-past: higher = more recent
    });

  // ── Stats ─────────────────────────────────────────────────────────────────
  const birthdaysThisMonth = visibleMembers.filter((m) => {
    if (!m.birthday) return false;
    return parseInt(m.birthday.split("-")[1]!, 10) === currentMonth;
  }).length;

  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const newContactsCount = visibleMembers.filter(
    (m) => m.id !== requesterId && m.createdAt >= thirtyDaysAgo,
  ).length;

  // ── Recent updates ────────────────────────────────────────────────────────
  // Two real signals, merged: (1) members who joined within the last 14 days
  // (from personsTable.createdAt, not a guess), and (2) real life_events rows
  // logged in the same window. Previously this classified "what changed" by
  // guessing from which fields happen to be populated *now* (e.g. "added a
  // photo" whenever photoUrl was truthy, even if it had been set for months) --
  // that's field-presence, not an actual event. Life events are real,
  // user-logged entries, so use those instead.
  const fourteenDaysAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
  const visibleMemberIds = new Set(visibleMembers.map((m) => m.id));

  const joinedEntries = visibleMembers
    .filter((m) => m.id !== requesterId && m.createdAt >= fourteenDaysAgo)
    .map((m) => ({
      memberId: m.id,
      name: `${m.firstName} ${m.lastName}`,
      changeType: "joined",
      description: `${m.firstName} ${m.lastName} joined the family`,
      timestamp: m.createdAt,
      avatarUrl: m.photoUrl ?? null,
      initials: ((m.firstName[0] ?? "?") + (m.lastName[0] ?? "?")).toUpperCase(),
    }));

  const recentLifeEvents = await db
    .select()
    .from(lifeEventsTable)
    .where(and(eq(lifeEventsTable.familyId, unitId), gte(lifeEventsTable.createdAt, fourteenDaysAgo)));

  const membersById = new Map(allMembers.map((m) => [m.id, m]));
  const lifeEventEntries = recentLifeEvents
    .filter((e) => e.personId !== requesterId && visibleMemberIds.has(e.personId))
    .map((e) => {
      const person = membersById.get(e.personId)!;
      const label = EVENT_TYPE_LABEL[e.eventType] ?? e.eventType;
      return {
        memberId: person.id,
        name: `${person.firstName} ${person.lastName}`,
        changeType: e.eventType,
        description: `${person.firstName} — ${label}`,
        timestamp: e.createdAt,
        avatarUrl: person.photoUrl ?? null,
        initials: ((person.firstName[0] ?? "?") + (person.lastName[0] ?? "?")).toUpperCase(),
      };
    });

  const recentUpdates = [...joinedEntries, ...lifeEventEntries]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 5)
    .map((e) => ({ ...e, timestamp: e.timestamp.toISOString() }));

  res.json({
    member: {
      id: viewer.id,
      firstName: viewer.firstName,
      profileCompleteness,
      missingPriorityField,
    },
    family: { unitName: unit.unitName },
    upcomingBirthdays,
    stats: { birthdaysThisMonth, newContactsCount },
    recentUpdates,
  });
});

export default router;
