export const BIRTHDAY_PLACEHOLDER_YEAR = 2000;

export function daysUntilBirthday(birthday: string): number {
  const [, monthStr, dayStr] = birthday.split("-");
  const month = parseInt(monthStr!, 10);
  const day = parseInt(dayStr!, 10);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let next = new Date(today.getFullYear(), month - 1, day);
  if (next.getTime() < today.getTime()) {
    next = new Date(today.getFullYear() + 1, month - 1, day);
  }
  return Math.round((next.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

export function getAgeTurning(birthday: string): number | null {
  const [yearStr, monthStr, dayStr] = birthday.split("-");
  const birthYear = parseInt(yearStr!, 10);
  if (birthYear === BIRTHDAY_PLACEHOLDER_YEAR) return null;
  const month = parseInt(monthStr!, 10);
  const day = parseInt(dayStr!, 10);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisYearBirthday = new Date(today.getFullYear(), month - 1, day);
  const yearTurning = thisYearBirthday >= today ? today.getFullYear() : today.getFullYear() + 1;
  return yearTurning - birthYear;
}

export function formatBirthdayShort(birthday: string): string {
  const [, monthStr, dayStr] = birthday.split("-");
  const month = parseInt(monthStr!, 10);
  const day = parseInt(dayStr!, 10);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[month - 1]} ${day}`;
}
