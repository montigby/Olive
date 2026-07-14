import type { personsTable } from "@workspace/db";

export interface PersonUpdateInput {
  firstName?: string;
  lastName?: string;
  photoUrl?: string | null;
  phone?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressZip?: string | null;
  addressCountry?: string | null;
  birthday?: string | null;
  showBirthYear?: boolean;
  instagram?: string | null;
  facebook?: string | null;
  tiktok?: string | null;
  linkedin?: string | null;
  snapchat?: string | null;
  venmo?: string | null;
  bereal?: string | null;
  otherSocial?: string | null;
  relationshipLabel?: string;
  gender?: string | null;
  tier2ContactField?: string;
  confirmedMembersOnly?: boolean;
  hideAddress?: boolean;
  hideInstagram?: boolean;
  hideFacebook?: boolean;
  hideTiktok?: boolean;
  hideLinkedin?: boolean;
  hideSnapchat?: boolean;
  hideVenmo?: boolean;
  hideBereal?: boolean;
  hideOtherSocial?: boolean;
}

/** Maps a partial person-update payload onto Drizzle update columns.
 * Shared by the REST PATCH /api/persons/:personId route and the AI chat
 * update tool so both honor the exact same field set and admin-only gate
 * on relationshipLabel. */
export function buildPersonUpdateData(
  data: PersonUpdateInput,
  opts: { allowRelationshipLabel: boolean },
): Partial<typeof personsTable.$inferInsert> {
  const updateData: Partial<typeof personsTable.$inferInsert> = {};
  if (data.firstName !== undefined) updateData.firstName = data.firstName;
  if (data.lastName !== undefined) updateData.lastName = data.lastName;
  if (data.photoUrl !== undefined) updateData.photoUrl = data.photoUrl;
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.addressLine1 !== undefined) updateData.addressLine1 = data.addressLine1;
  if (data.addressCity !== undefined) updateData.addressCity = data.addressCity;
  if (data.addressState !== undefined) updateData.addressState = data.addressState;
  if (data.addressZip !== undefined) updateData.addressZip = data.addressZip;
  if (data.addressCountry !== undefined) updateData.addressCountry = data.addressCountry;
  if (data.birthday !== undefined) updateData.birthday = data.birthday;
  if (data.showBirthYear !== undefined) updateData.showBirthYear = data.showBirthYear;
  if (data.instagram !== undefined) updateData.instagram = data.instagram;
  if (data.facebook !== undefined) updateData.facebook = data.facebook;
  if (data.tiktok !== undefined) updateData.tiktok = data.tiktok;
  if (data.linkedin !== undefined) updateData.linkedin = data.linkedin;
  if (data.snapchat !== undefined) updateData.snapchat = data.snapchat;
  if (data.venmo !== undefined) updateData.venmo = data.venmo;
  if (data.bereal !== undefined) updateData.bereal = data.bereal;
  if (data.otherSocial !== undefined) updateData.otherSocial = data.otherSocial;
  if (data.relationshipLabel !== undefined && opts.allowRelationshipLabel) {
    updateData.relationshipLabel = data.relationshipLabel;
  }
  if (data.gender !== undefined) {
    updateData.gender = data.gender;
  }
  if (data.tier2ContactField !== undefined) {
    updateData.tier2ContactField = data.tier2ContactField as typeof personsTable.$inferSelect["tier2ContactField"];
  }
  if (data.confirmedMembersOnly !== undefined) updateData.confirmedMembersOnly = data.confirmedMembersOnly;
  if (data.hideAddress !== undefined) updateData.hideAddress = data.hideAddress;
  if (data.hideInstagram !== undefined) updateData.hideInstagram = data.hideInstagram;
  if (data.hideFacebook !== undefined) updateData.hideFacebook = data.hideFacebook;
  if (data.hideTiktok !== undefined) updateData.hideTiktok = data.hideTiktok;
  if (data.hideLinkedin !== undefined) updateData.hideLinkedin = data.hideLinkedin;
  if (data.hideSnapchat !== undefined) updateData.hideSnapchat = data.hideSnapchat;
  if (data.hideVenmo !== undefined) updateData.hideVenmo = data.hideVenmo;
  if (data.hideBereal !== undefined) updateData.hideBereal = data.hideBereal;
  if (data.hideOtherSocial !== undefined) updateData.hideOtherSocial = data.hideOtherSocial;
  // Only bump updatedAt if something is actually changing -- it drives the
  // "Recent updates" home feed, so a no-op call shouldn't surface someone
  // there with nothing real to show.
  if (Object.keys(updateData).length > 0) {
    updateData.updatedAt = new Date();
  }
  return updateData;
}
