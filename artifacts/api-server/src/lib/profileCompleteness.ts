import type { Person } from "@workspace/db";

export type MissingPriorityField = "phone" | "photo" | "email" | "birthday";

// firstName + lastName always present = 20 pts. Each of the 4 key fields
// adds 20 pts. Total = 100.
export function computeProfileCompleteness(
  person: Pick<Person, "phone" | "photoUrl" | "email" | "birthday">,
): { profileCompleteness: number; missingPriorityField: MissingPriorityField | null } {
  const profileCompleteness =
    20 +
    (person.phone ? 20 : 0) +
    (person.photoUrl ? 20 : 0) +
    (person.email ? 20 : 0) +
    (person.birthday ? 20 : 0);

  const missingPriorityField: MissingPriorityField | null = !person.phone
    ? "phone"
    : !person.photoUrl
      ? "photo"
      : !person.email
        ? "email"
        : !person.birthday
          ? "birthday"
          : null;

  return { profileCompleteness, missingPriorityField };
}
