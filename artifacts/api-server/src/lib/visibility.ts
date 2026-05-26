type EdgeKind = "couple" | "parent-child" | "sibling";

interface FamilyEdge {
  to: string;
  kind: EdgeKind;
  isDown: boolean; // true for parent→child, false for child→parent or lateral
}

type FamilyGraph = Map<string, FamilyEdge[]>;

// Label sets
const COUPLE_LABELS = new Set(["husband", "wife", "spouse", "partner"]);
const PARENT_OF_ADMIN = new Set(["mom", "mother", "dad", "father"]);
const CHILD_OF_ADMIN = new Set(["son", "daughter"]);
const SIBLING_OF_ADMIN = new Set(["brother", "sister", "sibling"]);
const INLAW_PARENT = new Set(["mother-in-law", "father-in-law"]);
const INLAW_SIBLING = new Set(["brother-in-law", "sister-in-law"]);
const NEPHEW_NIECE = new Set(["nephew", "niece"]);
const GRANDCHILD_LABELS = new Set(["grandson", "granddaughter", "grandchild"]);
const GRANDPARENT_LABELS = new Set([
  "grandma", "grandpa", "grandmother", "grandfather",
  "nana", "papa", "nan", "pop", "pops", "gram", "gramps",
]);

// OLD label sets kept internally for cross-unit fallback in computeTier
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

function nl(label: string | null | undefined): string {
  return (label ?? "").toLowerCase().trim();
}

function buildFamilyGraph(allMembers: any[]): FamilyGraph {
  const graph: FamilyGraph = new Map();
  for (const m of allMembers) graph.set(m.id, []);

  const addParentChild = (parentId: string, childId: string) => {
    if (parentId === childId || !graph.has(parentId) || !graph.has(childId)) return;
    if (!graph.get(parentId)!.some(e => e.to === childId)) {
      graph.get(parentId)!.push({ to: childId, kind: "parent-child", isDown: true });
    }
    if (!graph.get(childId)!.some(e => e.to === parentId)) {
      graph.get(childId)!.push({ to: parentId, kind: "parent-child", isDown: false });
    }
  };

  const addCouple = (aId: string, bId: string) => {
    if (aId === bId || !graph.has(aId) || !graph.has(bId)) return;
    if (!graph.get(aId)!.some(e => e.to === bId)) {
      graph.get(aId)!.push({ to: bId, kind: "couple", isDown: false });
    }
    if (!graph.get(bId)!.some(e => e.to === aId)) {
      graph.get(bId)!.push({ to: aId, kind: "couple", isDown: false });
    }
  };

  const addSibling = (aId: string, bId: string) => {
    if (aId === bId || !graph.has(aId) || !graph.has(bId)) return;
    if (!graph.get(aId)!.some(e => e.to === bId)) {
      graph.get(aId)!.push({ to: bId, kind: "sibling", isDown: false });
    }
    if (!graph.get(bId)!.some(e => e.to === aId)) {
      graph.get(bId)!.push({ to: aId, kind: "sibling", isDown: false });
    }
  };

  const admin = allMembers.find(m => m.isAdmin);
  if (!admin) return graph;

  const adminSpouse = allMembers.find(m => COUPLE_LABELS.has(nl(m.relationshipLabel)));
  if (adminSpouse) addCouple(admin.id, adminSpouse.id);

  const adminParents: any[] = [];
  const adminSiblings: any[] = [];
  const inlawParents: any[] = [];
  const inlawSiblings: any[] = [];

  for (const m of allMembers) {
    if (m.id === admin.id) continue;
    const l = nl(m.relationshipLabel);

    if (COUPLE_LABELS.has(l)) {
      // already handled above
    } else if (PARENT_OF_ADMIN.has(l)) {
      addParentChild(m.id, admin.id);
      adminParents.push(m);
    } else if (GRANDPARENT_LABELS.has(l)) {
      if (m.parentPersonId && graph.has(m.parentPersonId)) {
        addParentChild(m.id, m.parentPersonId);
      } else {
        addParentChild(m.id, admin.id);
      }
    } else if (CHILD_OF_ADMIN.has(l) || m.parentPersonId === admin.id) {
      addParentChild(admin.id, m.id);
    } else if (SIBLING_OF_ADMIN.has(l)) {
      addSibling(admin.id, m.id);
      adminSiblings.push(m);
    } else if (INLAW_PARENT.has(l) && adminSpouse) {
      addParentChild(m.id, adminSpouse.id);
      inlawParents.push(m);
    } else if (INLAW_SIBLING.has(l) && adminSpouse) {
      addSibling(adminSpouse.id, m.id);
      inlawSiblings.push(m);
    } else if (NEPHEW_NIECE.has(l)) {
      if (m.parentPersonId && graph.has(m.parentPersonId)) {
        addParentChild(m.parentPersonId, m.id);
      }
    } else if (GRANDCHILD_LABELS.has(l)) {
      if (m.parentPersonId && graph.has(m.parentPersonId)) {
        addParentChild(m.parentPersonId, m.id);
      } else {
        addParentChild(admin.id, m.id);
      }
    }

    // Extra parentPersonId edges for non-trivially-handled members
    if (
      m.parentPersonId &&
      m.parentPersonId !== admin.id &&
      graph.has(m.parentPersonId)
    ) {
      const edges = graph.get(m.id)!;
      if (!edges.some(e => e.to === m.parentPersonId)) {
        addParentChild(m.parentPersonId, m.id);
      }
    }
  }

  // Infer couple edges within same-gen groups
  if (adminParents.length >= 2) addCouple(adminParents[0].id, adminParents[1].id);
  if (inlawParents.length >= 2) addCouple(inlawParents[0].id, inlawParents[1].id);

  // Admin's parents are also parents of admin's siblings
  for (const parent of adminParents) {
    for (const sib of adminSiblings) {
      addParentChild(parent.id, sib.id);
    }
  }

  // In-law parents are also parents of in-law siblings
  for (const parent of inlawParents) {
    for (const sib of inlawSiblings) {
      addParentChild(parent.id, sib.id);
    }
  }

  // Infer sibling-couple edges via parentPersonId
  for (const m of allMembers) {
    if (!m.parentPersonId) continue;
    const l = nl(m.relationshipLabel);
    const partner = allMembers.find(p => p.id === m.parentPersonId);
    if (!partner) continue;
    const pl = nl(partner.relationshipLabel);
    const mIsSib = SIBLING_OF_ADMIN.has(l) || INLAW_SIBLING.has(l);
    const pIsSib = SIBLING_OF_ADMIN.has(pl) || INLAW_SIBLING.has(pl);
    if (mIsSib && pIsSib) {
      addCouple(m.id, m.parentPersonId);
    }
  }

  return graph;
}

export function computeVisibleSet(
  viewerPerson: any,
  allMembers: any[],
): Map<string, 0 | 1 | 2 | 3 | 4> {
  const result = new Map<string, 0 | 1 | 2 | 3 | 4>();

  if (viewerPerson.isAdmin) {
    for (const m of allMembers) result.set(m.id, 0);
    return result;
  }

  const graph = buildFamilyGraph(allMembers);

  // Self = tier 0
  result.set(viewerPerson.id, 0);

  // Tier 1: all direct neighbors (any edge, any direction)
  const viewerEdges = graph.get(viewerPerson.id) ?? [];
  for (const edge of viewerEdges) {
    if (!result.has(edge.to)) result.set(edge.to, 1);
  }

  // Tier 2: from each tier-1 neighbor, expand only via couple + downward parent-child
  for (const edge of viewerEdges) {
    const neighborEdges = graph.get(edge.to) ?? [];
    for (const e2 of neighborEdges) {
      if (!result.has(e2.to)) {
        if (e2.kind === "couple" || (e2.kind === "parent-child" && e2.isDown)) {
          result.set(e2.to, 2);
        }
      }
    }
  }

  // Everyone else = tier 4
  for (const m of allMembers) {
    if (!result.has(m.id)) result.set(m.id, 4);
  }

  return result;
}

export function computeTier(
  viewerPerson: any,
  targetPerson: any,
  allMembers: any[],
): 0 | 1 | 2 | 3 | 4 {
  if (viewerPerson.isAdmin) return 0;
  if (viewerPerson.id === targetPerson.id) return 0;

  // Same family unit: use graph-based visibility
  if (viewerPerson.familyUnitId === targetPerson.familyUnitId) {
    const visibleSet = computeVisibleSet(viewerPerson, allMembers);
    return visibleSet.get(targetPerson.id) ?? 4;
  }

  // Different unit: keep old label-based behavior
  if (targetPerson.isAdmin) return 1;
  const label = nl(targetPerson.relationshipLabel);
  if (TIER1_LABELS.has(label)) return 1;
  if (TIER2_LABELS.has(label)) return 2;
  return 3;
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
      snapchat: person.snapchat,
      venmo: person.venmo,
      bereal: person.bereal,
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
