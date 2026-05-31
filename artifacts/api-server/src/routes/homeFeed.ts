import { Router } from "express";
import { db, personsTable, familyUnitsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

// Returns daysUntil the next occurrence of this birthday (0 = today).
function daysUntilBirthday(birthday: string): number {
  const parts = birthday.split("-");
  const month = parseInt(parts[1]!, 10);
  const day = parseInt(parts[2]!, 10);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(today.getFullYear(), month - 1, day);
  if (next.getTime() <= today.getTime()) {
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

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const currentMonth = now.getMonth() + 1; // 1–12

  // ── Profile completeness ──────────────────────────────────────────────────
  // firstName + lastName always present = 20 pts.  Each of the 4 key fields
  // adds 20 pts.  Total = 100.
  const profileCompleteness =
    20 +
    (viewer.phone ? 20 : 0) +
    (viewer.photoUrl ? 20 : 0) +
    (viewer.email ? 20 : 0) +
    (viewer.birthday ? 20 : 0);

  const missingPriorityField: "phone" | "photo" | "email" | "birthday" | null =
    !viewer.phone ? "phone" :
    !viewer.photoUrl ? "photo" :
    !viewer.email ? "email" :
    !viewer.birthday ? "birthday" :
    null;

  // ── Upcoming birthdays ────────────────────────────────────────────────────
  const upcomingBirthdays = allMembers
    .filter((m) => !!m.birthday)
    .map((m) => {
      const parts = m.birthday!.split("-");
      const birthYear = parseInt(parts[0]!, 10);
      const birthMonth = parseInt(parts[1]!, 10);
      const birthDay = parseInt(parts[2]!, 10);
      const daysUntil = daysUntilBirthday(m.birthday!);

      // Year 2000 is the placeholder stored when the user doesn't supply a year.
      const realBirthYear = birthYear > 2000 ? birthYear : null;
      const yearTurning = today.getFullYear() + (daysUntil === 0 ? 0 : 1);
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
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 5);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const birthdaysThisMonth = allMembers.filter((m) => {
    if (!m.birthday) return false;
    return parseInt(m.birthday.split("-")[1]!, 10) === currentMonth;
  }).length;

  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const newContactsCount = allMembers.filter(
    (m) => m.id !== requesterId && m.createdAt >= thirtyDaysAgo,
  ).length;

  // ── Recent updates ────────────────────────────────────────────────────────
  // Members (excluding viewer) whose record changed within the last 14 days.
  // We classify the update type heuristically from which fields they filled.
  const fourteenDaysAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
  const recentUpdates = allMembers
    .filter((m) => m.id !== requesterId && m.updatedAt >= fourteenDaysAgo)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 3)
    .map((m) => {
      // If updatedAt ≈ createdAt (< 1 hr gap) the person just joined; otherwise
      // they returned and updated their profile.
      const secsSinceCreation =
        (m.updatedAt.getTime() - m.createdAt.getTime()) / 1000;
      const isNew = secsSinceCreation < 3600;

      let changeType: string;
      let description: string;

      if (isNew) {
        changeType = "joined";
        description = `${m.firstName} ${m.lastName} joined the family`;
      } else if (m.photoUrl) {
        changeType = "photo";
        description = `${m.firstName} added a photo`;
      } else if (m.phone) {
        changeType = "phone";
        description = `${m.firstName} added a phone number`;
      } else if (m.addressLine1) {
        changeType = "address";
        description = `${m.firstName} updated their address`;
      } else {
        changeType = "profile";
        description = `${m.firstName} updated their profile`;
      }

      return {
        memberId: m.id,
        name: `${m.firstName} ${m.lastName}`,
        changeType,
        description,
        timestamp: m.updatedAt.toISOString(),
        avatarUrl: m.photoUrl ?? null,
        initials: ((m.firstName[0] ?? "?") + (m.lastName[0] ?? "?")).toUpperCase(),
      };
    });

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
