// Relationship labels grouped by tier distance FROM the family head/admin
const TIER1_LABELS = new Set([
  "husband", "wife", "spouse", "partner",
  "mom", "mother", "dad", "father",
  "son", "daughter", "brother", "sister", "sibling",
]);
const TIER2_LABELS = new Set([
  "brother-in-law", "sister-in-law",
  "grandmother", "grandfather", "grandma", "grandpa",
  "nana", "papa", "nan", "pop", "pops", "gram", "gramps",
  "grandson", "granddaughter", "grandchild",
  "nephew", "niece",
]);
const TIER3_LABELS = new Set(["uncle", "aunt", "cousin", "nephew", "niece"]);

export function computeTier(
  viewerPerson: any,
  targetPerson: any,
  _allMembers: any[],
): 0 | 1 | 2 | 3 | 4 {
  // Admin sees everything
  if (viewerPerson.isAdmin) return 0;
  // Self
  if (viewerPerson.id === targetPerson.id) return 0;
  // Target is admin → Tier 1 (admin is the family head, direct relationship)
  if (targetPerson.isAdmin) return 1;

  const label = (targetPerson.relationshipLabel || "").toLowerCase().trim();
  if (TIER1_LABELS.has(label)) return 1;
  if (TIER2_LABELS.has(label)) return 2;
  if (TIER3_LABELS.has(label)) return 3;
  return 3; // default for unknown labels within same unit
}

export function applyVisibility(person: any, tier: 0 | 1 | 2 | 3 | 4): any {
  if (tier === 4) return null; // not visible

  // Base visible fields for all tiers
  const base: any = {
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    relationshipLabel: person.relationshipLabel,
    photoUrl: person.photoUrl,
    familyUnitId: person.familyUnitId,
    isAdmin: person.isAdmin,
    claimed: person.claimed,
    parentPersonId: person.parentPersonId ?? null,
  };

  if (tier <= 1) {
    // Full profile
    return {
      ...base,
      birthday: person.birthday,
      showBirthYear: person.showBirthYear,
      phone: person.phone,
      email: person.email,
      addressLine1: person.addressLine1,
      addressCity: person.addressCity,
      addressState: person.addressState,
      addressZip: person.addressZip,
      addressCountry: person.addressCountry,
      instagram: person.instagram,
      facebook: person.facebook,
      tiktok: person.tiktok,
      linkedin: person.linkedin,
      otherSocial: person.otherSocial,
      tier2ContactField: person.tier2ContactField,
      confirmedMembersOnly: person.confirmedMembersOnly,
      claimedAt: person.claimedAt,
      inviteExpiresAt: person.inviteExpiresAt,
      createdAt: person.createdAt,
      updatedAt: person.updatedAt,
    };
  }

  if (tier === 2) {
    // Full name, photo, relationship, birthday, ONE contact field
    const contactField =
      person.tier2ContactField === "email" ? "email" : "phone";
    return {
      ...base,
      birthday: person.birthday,
      showBirthYear: person.showBirthYear,
      [contactField]: person[contactField],
      claimedAt: person.claimedAt,
      inviteExpiresAt: person.inviteExpiresAt,
      createdAt: person.createdAt,
      updatedAt: person.updatedAt,
    };
  }

  // Tier 3: name, relationship, photo only
  return {
    ...base,
    claimedAt: person.claimedAt,
    inviteExpiresAt: person.inviteExpiresAt,
    createdAt: person.createdAt,
    updatedAt: person.updatedAt,
  };
}
