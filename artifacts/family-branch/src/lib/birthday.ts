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
