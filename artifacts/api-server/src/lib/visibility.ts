type EdgeKind = "couple" | "parent-child" | "sibling";

interface FamilyEdge {
  to: string;
  kind: EdgeKind;
  isDown: boolean; // true for parent→child, false for child→parent or lateral
}

type FamilyGraph = Map<string, FamilyEdge[]>;

/**
 * Shape of a row from the `relationships` table that we care about for
 * graph building. Loosely typed to avoid pulling in @workspace/db types here;
 * routes that fetch from the table just need to project these three fields.
 *
 * Edge direction convention (matches the DB): for parent-type edges,
 * from_person = child and to_person = parent.
 */
export interface RelationshipEdge {
  fromPerson: string;
  toPerson: string;
  type: string;
}

const COUPLE_EDGE_TYPES = new Set(["spouse", "partner"]);
const PARENT_EDGE_TYPES = new Set([
  "biological_parent",
  "adoptive_parent",
  "step_parent",
]);

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

function buildFamilyGraph(
  allMembers: any[],
  relationships?: RelationshipEdge[],
): FamilyGraph {
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

  // Seed from explicit `relationships` edges first (high confidence).
  // The label heuristic below dedupes against these via the .some() checks
  // in addParentChild / addCouple / addSibling.
  if (relationships && relationships.length > 0) {
    const childrenByParent = new Map<string, Set<string>>();

    for (const r of relationships) {
      if (COUPLE_EDGE_TYPES.has(r.type)) {
        addCouple(r.fromPerson, r.toPerson);
      } else if (PARENT_EDGE_TYPES.has(r.type)) {
        // from_person = child, to_person = parent
        addParentChild(r.toPerson, r.fromPerson);
        if (!childrenByParent.has(r.toPerson)) {
          childrenByParent.set(r.toPerson, new Set());
        }
        childrenByParent.get(r.toPerson)!.add(r.fromPerson);
      }
      // ex_spouse intentionally excluded from couple tier.
    }

    // Derive sibling edges from shared parents.
    for (const childIds of childrenByParent.values()) {
      const ids = [...childIds];
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          addSibling(ids[i], ids[j]);
        }
      }
    }
  }

  const admin = allMembers.find(m => m.isAdmin);
  if (!admin) return graph;

  const adminSpouse = allMembers.find(m => COUPLE_LABELS.has(nl(m.relationshipLabel)));
  if (adminSpouse) addCouple(admin.id, adminSpouse.id);

  // Build an explicit-spouse map from the relationships table so we can
  // disambiguate "brother-in-law" / "sister-in-law" labels. The label is
  // ambiguous: it can mean either (a) admin's spouse's sibling — true in-law,
  // belongs to the adminSpouse-side clan — or (b) admin's sibling's spouse —
  // belongs to the admin-side clan via marriage. The label heuristic below
  // historically assumed (a), which leaked admin-side in-laws (e.g. Tanner's
  // wife "Anna" or Madeline's husband "Sam") into the adminSpouse-side clan's
  // visibility. Cross-checking the explicit spouse fixes that.
  const explicitSpouseMap = new Map<string, string>();
  if (relationships) {
    for (const r of relationships) {
      if (COUPLE_EDGE_TYPES.has(r.type)) {
        explicitSpouseMap.set(r.fromPerson, r.toPerson);
      }
    }
  }
  // Admin-side "core" people: admin + members labeled as admin's sibling.
  // Anyone whose explicit spouse falls in this set is admin-side-by-marriage,
  // not adminSpouse's sibling.
  const adminSideCoreIds = new Set<string>([admin.id]);
  for (const m of allMembers) {
    if (SIBLING_OF_ADMIN.has(nl(m.relationshipLabel))) {
      adminSideCoreIds.add(m.id);
    }
  }

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
      // Defer linking to the second pass below — we need adminParents to be
      // fully populated first so we can attach the grandparent ABOVE the
      // admin's parent (their proper generation) rather than directly above
      // the admin. Without this, grandparents end up at tier 1 to the admin's
      // descendants (one hop too close), letting them see two generations of
      // family instead of one.
    } else if (CHILD_OF_ADMIN.has(l) || m.parentPersonId === admin.id) {
      addParentChild(admin.id, m.id);
    } else if (SIBLING_OF_ADMIN.has(l)) {
      addSibling(admin.id, m.id);
      adminSiblings.push(m);
    } else if (INLAW_PARENT.has(l) && adminSpouse) {
      addParentChild(m.id, adminSpouse.id);
      inlawParents.push(m);
    } else if (INLAW_SIBLING.has(l) && adminSpouse) {
      // Disambiguation: if their explicit spouse is admin or admin-sibling,
      // they're admin-side via marriage — DON'T link them into adminSpouse's
      // clan or the "in-law parents are also parents of in-law siblings" loop.
      const theirSpouseId = explicitSpouseMap.get(m.id);
      if (theirSpouseId && adminSideCoreIds.has(theirSpouseId)) {
        // admin-side in-law (e.g. Anna, Sam) — fall through with no edge
      } else {
        addSibling(adminSpouse.id, m.id);
        inlawSiblings.push(m);
      }
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

  // Deferred grandparent pass: link grandparents as the PARENT of one of the
  // admin's parents (their correct generation) rather than as a parent of the
  // admin. Uses parentPersonId when set (specifies which side); otherwise
  // attaches to the admin's first parent. Falls back to admin only if the
  // admin has no parent in the unit (broken data, but at least connected).
  for (const m of allMembers) {
    if (m.id === admin.id) continue;
    const l = nl(m.relationshipLabel);
    if (!GRANDPARENT_LABELS.has(l)) continue;
    if (m.parentPersonId && graph.has(m.parentPersonId)) {
      addParentChild(m.id, m.parentPersonId);
    } else if (adminParents.length > 0) {
      addParentChild(m.id, adminParents[0].id);
    } else {
      addParentChild(m.id, admin.id);
    }
  }

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
  relationships?: RelationshipEdge[],
): Map<string, 0 | 1 | 2 | 3 | 4> {
  const result = new Map<string, 0 | 1 | 2 | 3 | 4>();

  if (viewerPerson.isAdmin) {
    for (const m of allMembers) result.set(m.id, 0);
    return result;
  }

  const graph = buildFamilyGraph(allMembers, relationships);

  // Self = tier 0
  result.set(viewerPerson.id, 0);

  // Tier 1: all direct neighbors (any edge, any direction)
  const viewerEdges = graph.get(viewerPerson.id) ?? [];
  for (const edge of viewerEdges) {
    if (!result.has(edge.to)) result.set(edge.to, 1);
  }

  // Tier 2: from each tier-1 neighbor, expand via couple, parent-child (both
  // directions), and sibling. This gives in-laws their full "in-law family"
  // (spouse's parents, spouse's siblings, etc.).
  //
  // Additionally: whenever we add someone at tier 2, also add their spouse at
  // tier 2. This surfaces:
  //   • sibling-then-couple — Anna sees Sam (Madeline's husband)
  //   • parent-child-down-then-couple — James sees Miranda (Spencer's wife)
  //   • parent-child-up-then-couple — children see their parent-in-law
  // without expanding to tier 3 in any direction, so the silo across the
  // admin↔adminSpouse bridge holds: a tier-2 person's spouse-of-spouse is NOT
  // reached because we never recurse from a tier-2 member's edges.
  for (const edge of viewerEdges) {
    const neighborEdges = graph.get(edge.to) ?? [];
    for (const e2 of neighborEdges) {
      if (e2.to === viewerPerson.id) continue;

      const isExpandable =
        e2.kind === "couple" ||
        e2.kind === "parent-child" ||
        e2.kind === "sibling";
      if (!isExpandable) continue;

      if (!result.has(e2.to)) {
        result.set(e2.to, 2);
      }

      // Spouse-of-tier-2: also surface the tier-2 target's spouse.
      const t2Edges = graph.get(e2.to) ?? [];
      for (const e3 of t2Edges) {
        if (
          e3.kind === "couple" &&
          e3.to !== viewerPerson.id &&
          !result.has(e3.to)
        ) {
          result.set(e3.to, 2);
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
  relationships?: RelationshipEdge[],
): 0 | 1 | 2 | 3 | 4 {
  if (viewerPerson.isAdmin) return 0;
  if (viewerPerson.id === targetPerson.id) return 0;

  // Same family unit: use graph-based visibility
  if (viewerPerson.familyUnitId === targetPerson.familyUnitId) {
    const visibleSet = computeVisibleSet(viewerPerson, allMembers, relationships);
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

  // Target's "Restrict to direct & close family" preference:
  // when set, only tier 0 / 1 / 2 viewers see the profile at all.
  // Tier 3 viewers are dropped entirely. Tier 0 (self / admin) still
  // sees the target — admins manage the directory and self always wins.
  if (person.confirmedMembersOnly && tier === 3) return null;

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
    const full: any = {
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
      hideAddress: person.hideAddress,
      hideSocials: person.hideSocials,
      claimedAt: person.claimedAt,
      inviteExpiresAt: person.inviteExpiresAt,
      createdAt: person.createdAt,
      updatedAt: person.updatedAt,
    };

    // Tier 0 (self / admin) always sees everything, regardless of toggles.
    // Tier 1 respects the target's per-user privacy toggles.
    if (tier === 1) {
      if (person.hideAddress) {
        full.addressLine1 = null;
        full.addressCity = null;
        full.addressState = null;
        full.addressZip = null;
        full.addressCountry = null;
      }
      if (person.hideSocials) {
        full.instagram = null;
        full.facebook = null;
        full.tiktok = null;
        full.linkedin = null;
        full.snapchat = null;
        full.venmo = null;
        full.bereal = null;
        full.otherSocial = null;
      }
    }

    return full;
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
