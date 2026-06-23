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
