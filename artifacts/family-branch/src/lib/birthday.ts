export const PLACEHOLDER_YEAR = 2000;

export function parseDateLocal(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

export function formatBirthdayDate(birthday: string): string {
  return parseDateLocal(birthday).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

export function getAgeTurning(
  birthday: string,
  showBirthYear: boolean,
): number | null {
  if (!showBirthYear) return null;
  const [yearStr, monthStr, dayStr] = birthday.split("-");
  const birthYear = parseInt(yearStr!, 10);
  if (birthYear === PLACEHOLDER_YEAR) return null;
  const birthMonth = parseInt(monthStr!, 10);
  const birthDay = parseInt(dayStr!, 10);
  const today = new Date();
  const thisYearBirthday = new Date(today.getFullYear(), birthMonth - 1, birthDay);
  const yearTurning =
    thisYearBirthday >= today ? today.getFullYear() : today.getFullYear() + 1;
  return yearTurning - birthYear;
}

/** Days until the next occurrence of this birthday. Stays negative for up to
 * 7 days after it's passed (so callers can show "X days ago"), then rolls
 * forward to next year. Mirrors the same window used by the birthday-emails
 * cron and the /api/summary endpoint. */
export function daysUntilBirthday(birthday: string): number {
  const bday = parseDateLocal(birthday);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisYear = new Date(now.getFullYear(), bday.getMonth(), bday.getDate());
  let daysUntil = Math.round((thisYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (daysUntil < -7) {
    thisYear.setFullYear(now.getFullYear() + 1);
    daysUntil = Math.round((thisYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }
  return daysUntil;
}

const AVG_DAYS_PER_MONTH = 30.44;

/** How far away a birthday is, in whichever unit reads more naturally: days
 * for anything within about a month, otherwise the nearest whole month.
 * Uses an average month length and *rounds* (rather than floors/ceils) so
 * the days/months switch lands at the real midpoint (~45.5 days) instead of
 * jumping at a fixed day count -- otherwise a birthday just under 2 months
 * out could round down to "1 month" while one just over 1 month out rounds
 * up to "2 months", which is the inconsistency this is meant to avoid. */
export function formatDaysUntil(daysUntil: number, opts: { compact?: boolean } = {}): string {
  const { compact = false } = opts;
  if (daysUntil === 0) return "Today!";
  if (daysUntil === 1) return "Tomorrow";
  if (daysUntil <= 30) return compact ? `In ${daysUntil}d` : `In ${daysUntil} days`;
  const months = Math.round(daysUntil / AVG_DAYS_PER_MONTH);
  return compact ? `In ${months}mo` : `In about ${months} month${months === 1 ? "" : "s"}`;
}

/** Opens the user's SMS or email app pre-filled with a birthday message,
 * falling back to a toast when there's no contact info to reach them by. */
export function sendBirthdayWish(
  person: { firstName: string; phone?: string | null; email?: string | null },
  toast: (opts: { title: string; description?: string }) => void,
) {
  const msg = `Happy birthday, ${person.firstName}! 🎂`;
  if (person.phone) {
    window.open(`sms:${person.phone}?body=${encodeURIComponent(msg)}`, "_self");
    return;
  }
  if (person.email) {
    window.open(
      `mailto:${person.email}?subject=${encodeURIComponent("Happy Birthday!")}&body=${encodeURIComponent(msg)}`,
      "_self",
    );
    return;
  }
  toast({ title: "No contact info", description: `We don't have ${person.firstName}'s phone or email yet.` });
}
