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

  // Pre-pass: detect "[X]-in-law" + "[X]" pairs sharing the same
  // parentPersonId — e.g. Megan ("cousin") and Spencer Witt ("cousin-in-law")
  // both added under Uncle Jim. The admin had no clean way to express "they
  // married each other" so the in-law row ended up with the spouse's parent
  // on file. We:
  //   • record the in-law id so the parentPersonId fallback below skips it
  //     (it would otherwise look like a sibling of its actual spouse), and
  //   • queue the couple to add once the graph is built.
  const sharedParentInlawSkip = new Set<string>();
  const sharedParentInlawCouples: Array<[string, string]> = [];
  {
    const buckets = new Map<string, any[]>();
    for (const m of allMembers) {
      if (!m.parentPersonId) continue;
      if (!buckets.has(m.parentPersonId)) buckets.set(m.parentPersonId, []);
      buckets.get(m.parentPersonId)!.push(m);
    }
    for (const bucket of buckets.values()) {
      if (bucket.length < 2) continue;
      for (const a of bucket) {
        const al = nl(a.relationshipLabel);
        if (!al.endsWith("-in-law")) continue;
        const base = al.slice(0, -"-in-law".length);
        const partner = bucket.find(
          (b) => b.id !== a.id && nl(b.relationshipLabel) === base,
        );
        if (partner) {
          sharedParentInlawSkip.add(a.id);
          sharedParentInlawCouples.push([a.id, partner.id]);
        }
      }
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

    // Extra parentPersonId edges for non-trivially-handled members. Skipped
    // for GRANDPARENT_LABELS members -- for them, parentPersonId points to
    // their CHILD (see the deferred grandparent pass below), the opposite
    // meaning it has everywhere else. Without this guard, this block ran
    // first and added a backwards edge (treating the grandparent as the
    // child of their own child), which then blocked the deferred pass's
    // correct edge via addParentChild's existing-edge dedup check.
    if (
      m.parentPersonId &&
      m.parentPersonId !== admin.id &&
      graph.has(m.parentPersonId) &&
      !sharedParentInlawSkip.has(m.id) &&
      !GRANDPARENT_LABELS.has(l)
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

  // Couple edges from the shared-parent in-law detection at the top of this
  // function (e.g. Megan ↔ Spencer Witt).
  for (const [a, b] of sharedParentInlawCouples) {
    addCouple(a, b);
  }

  return graph;
}

// Is `parentId` a parent of `childId` per the same family graph used for
// visibility? Reuses buildFamilyGraph so parent detection covers both
// explicit `relationships` rows and the label-based heuristics (grandparent,
// nephew/niece anchors, etc.) -- not just the narrow subset of labels
// syncPersonToRelationshipLayer writes to the relationships table.
export function isParentOf(
  parentId: string,
  childId: string,
  allMembers: any[],
  relationships?: RelationshipEdge[],
): boolean {
  if (parentId === childId) return false;
  const graph = buildFamilyGraph(allMembers, relationships);
  const edges = graph.get(parentId) ?? [];
  return edges.some((e) => e.to === childId && e.kind === "parent-child" && e.isDown);
}

// ---------------------------------------------------------------------------
// Viewer-relative relationship labels
// ---------------------------------------------------------------------------
//
// The `relationshipLabel` column on `persons` is a static string set once,
// from the perspective of whoever the admin was at the time the person was
// added (e.g. Zachary's row says "Brother" because Jackson, the admin, added
// him). That's wrong for anyone else viewing -- Zachary logging in should see
// himself as "Me" and Jackson as "Brother", not the reverse. This section
// derives a label describing `targetId` relative to `viewerId`, using the
// same family graph buildFamilyGraph produces for visibility tiers (so it
// benefits from the same explicit-relationships-first, label-heuristic-
// fallback behavior).

interface RelPathStep {
  kind: EdgeKind;
  isDown: boolean;
}

// Shortest path of graph edges from `fromId` to `toId` (BFS, so the first
// path found to any node is the shortest). Returns [] if fromId === toId,
// or null if unreachable.
function shortestFamilyPath(
  graph: FamilyGraph,
  fromId: string,
  toId: string,
): RelPathStep[] | null {
  if (fromId === toId) return [];

  const visited = new Set<string>([fromId]);
  const queue: Array<{ id: string; path: RelPathStep[] }> = [{ id: fromId, path: [] }];

  while (queue.length > 0) {
    const { id, path } = queue.shift()!;
    const edges = graph.get(id) ?? [];
    for (const e of edges) {
      if (visited.has(e.to)) continue;
      visited.add(e.to);
      const nextPath = [...path, { kind: e.kind, isDown: e.isDown }];
      if (e.to === toId) return nextPath;
      queue.push({ id: e.to, path: nextPath });
    }
  }

  return null;
}

// Encode a path as a short key: "pu" = parent-child, walked up (target is an
// ancestor); "pd" = parent-child, walked down (target is a descendant);
// "s" = sibling; "c" = couple (spouse/partner).
function pathKey(path: RelPathStep[]): string {
  return path
    .map((s) => (s.kind === "parent-child" ? `p${s.isDown ? "d" : "u"}` : s.kind[0]))
    .join(",");
}

// Gender of the *target* person drives the word choice throughout (e.g.
// "Sister" describes a female target regardless of the viewer's own
// gender). `g` is the target's `gender` column value ("male" | "female" |
// null/anything else = unspecified, which falls back to the neutral term).
type Gender = string | null | undefined;
function isMale(g: Gender): boolean {
  return g === "male";
}
function isFemale(g: Gender): boolean {
  return g === "female";
}

// Relationship labels for paths that include at least one spouse/couple hop.
// Kept as a small curated table since in-law relationships beyond a couple
// hop or two get genuinely ambiguous. Anything not covered here falls back
// to "Extended family".
const INLAW_PATH_LABELS: Record<string, { neutral: string; male: string; female: string }> = {
  c: { neutral: "Spouse", male: "Husband", female: "Wife" },
  "c,pu": { neutral: "Parent-in-law", male: "Father-in-law", female: "Mother-in-law" },
  "c,s": { neutral: "Sibling-in-law", male: "Brother-in-law", female: "Sister-in-law" },
  "s,c": { neutral: "Sibling-in-law", male: "Brother-in-law", female: "Sister-in-law" },
  "pd,c": { neutral: "Child-in-law", male: "Son-in-law", female: "Daughter-in-law" },
};

const ORDINALS = ["Zeroth", "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth"];
function ordinal(n: number): string {
  return ORDINALS[n] ?? `${n}th`;
}

function ancestorLabel(up: number, g: Gender): string {
  if (up === 1) return isMale(g) ? "Father" : isFemale(g) ? "Mother" : "Parent";
  if (up === 2) return isMale(g) ? "Grandfather" : isFemale(g) ? "Grandmother" : "Grandparent";
  const base = isMale(g) ? "grandfather" : isFemale(g) ? "grandmother" : "grandparent";
  return `Great-${"great-".repeat(up - 3)}${base}`;
}
function descendantLabel(down: number, g: Gender): string {
  if (down === 1) return isMale(g) ? "Son" : isFemale(g) ? "Daughter" : "Child";
  if (down === 2) return isMale(g) ? "Grandson" : isFemale(g) ? "Granddaughter" : "Grandchild";
  const base = isMale(g) ? "grandson" : isFemale(g) ? "granddaughter" : "grandchild";
  return `Great-${"great-".repeat(down - 3)}${base}`;
}
function auntUncleLabel(up: number, g: Gender): string {
  if (up === 2) return isMale(g) ? "Uncle" : isFemale(g) ? "Aunt" : "Aunt/Uncle";
  const base = isMale(g) ? "uncle" : isFemale(g) ? "aunt" : "aunt/uncle";
  return `Great-${"great-".repeat(up - 3)}${base}`;
}
function nieceNephewLabel(down: number, g: Gender): string {
  const base = isMale(g) ? "nephew" : isFemale(g) ? "niece" : "niece/nephew";
  if (down === 2) return isMale(g) ? "Nephew" : isFemale(g) ? "Niece" : "Niece/Nephew";
  if (down === 3) return `Grand-${base}`;
  return `Great-${"great-".repeat(down - 4)}grand-${base}`;
}
function cousinLabel(up: number, down: number): string {
  // "Cousin" doesn't conventionally split by gender in English -- left
  // neutral regardless of target gender.
  const degree = Math.min(up, down) - 1;
  const removed = Math.abs(up - down);
  const removedSuffix =
    removed === 0 ? "" : removed === 1 ? " once removed" : removed === 2 ? " twice removed" : ` ${removed} times removed`;
  return `${ordinal(degree)} cousin${removedSuffix}`;
}

// Name a pure blood-line relationship (no spouse/couple hops) from the
// number of "up" (toward a shared ancestor) and "down" (away from it)
// generations in the shortest path, gendered by the target's `gender`
// column when set. A "sibling" edge -- itself a collapsed "up one, down
// one" hop through a shared parent -- counts as +1 to both. This formula
// covers any path shape, unlike a hand-picked lookup table, which silently
// mislabeled e.g. two siblings connected only via a shared third sibling's
// edges (two "sibling" hops) as "Extended family".
function nameByGenerations(up: number, down: number, g: Gender): string {
  if (up === 0 && down === 0) return "Me";
  if (down === 0) return ancestorLabel(up, g);
  if (up === 0) return descendantLabel(down, g);
  if (up === 1 && down === 1) return isMale(g) ? "Brother" : isFemale(g) ? "Sister" : "Sibling";
  if (up === 1) return nieceNephewLabel(down, g);
  if (down === 1) return auntUncleLabel(up, g);
  return cousinLabel(up, down);
}

// Describe how `targetId` relates to `viewerId`, e.g. "Sister", "Father",
// "Grandmother" when the target's gender is set, falling back to the
// neutral term ("Sibling", "Parent", "Grandparent") otherwise -- for
// display purposes only. "Me" when they're the same person. Falls back to
// "Extended family" for in-law shapes not in INLAW_PATH_LABELS, and
// "Family member" when the two aren't connected in the graph at all (e.g.
// cross-unit callers should guard for that case themselves rather than
// rely on this fallback).
export function describeRelationship(
  viewerId: string,
  targetId: string,
  allMembers: any[],
  relationships?: RelationshipEdge[],
): string {
  if (viewerId === targetId) return "Me";

  const graph = buildFamilyGraph(allMembers, relationships);
  const path = shortestFamilyPath(graph, viewerId, targetId);
  if (path === null) return "Family member";
  if (path.length === 0) return "Me";

  const target = allMembers.find((m) => m.id === targetId);
  const gender: Gender = target?.gender ?? null;

  if (path.some((s) => s.kind === "couple")) {
    const labels = INLAW_PATH_LABELS[pathKey(path)];
    if (!labels) return "Extended family";
    return isMale(gender) ? labels.male : isFemale(gender) ? labels.female : labels.neutral;
  }

  // A path made entirely of "sibling" hops (e.g. reaching one admin-sibling
  // via another, "sibling,sibling") always routes through a single hub node
  // -- the family unit's admin, or their spouse for in-law siblings -- since
  // that's the only place addSibling ever radiates more than one edge from.
  // It's never a chain through distinct parent generations, so treat it as
  // a direct sibling relationship rather than running it through the
  // generation-counting formula below, which would double-count each hop's
  // "up one, down one" and misname it as a cousin.
  if (path.every((s) => s.kind === "sibling")) {
    return isMale(gender) ? "Brother" : isFemale(gender) ? "Sister" : "Sibling";
  }

  let up = 0;
  let down = 0;
  for (const step of path) {
    if (step.kind === "parent-child") {
      if (step.isDown) down++;
      else up++;
    } else {
      // sibling: one hop up to the shared parent, one hop back down
      up++;
      down++;
    }
  }
  return nameByGenerations(up, down, gender);
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

  // ── Descendants: walk DOWN from the viewer through parent-child edges to
  //    surface ALL descendants (children, grandchildren, great-grandchildren,
  //    ...) plus each descendant's spouse. Grandparents see their grandkids'
  //    spouses and great-grandkids without needing tier 3 to be a real bucket.
  //    The silo across the admin↔adminSpouse bridge still holds — this walk
  //    only follows parent-child-DOWN, never sideways via siblings or couples,
  //    so it cannot leak into the other clan.
  const descendantsQueue: string[] = [viewerPerson.id];
  const visitedDesc = new Set<string>([viewerPerson.id]);
  while (descendantsQueue.length > 0) {
    const cur = descendantsQueue.shift()!;
    const curEdges = graph.get(cur) ?? [];
    for (const e of curEdges) {
      if (e.kind !== "parent-child" || !e.isDown) continue;
      if (visitedDesc.has(e.to)) continue;
      visitedDesc.add(e.to);
      descendantsQueue.push(e.to);
      if (!result.has(e.to)) result.set(e.to, 2);
      // Spouse of the descendant is also tier 2.
      const descEdges = graph.get(e.to) ?? [];
      for (const de of descEdges) {
        if (
          de.kind === "couple" &&
          de.to !== viewerPerson.id &&
          !result.has(de.to)
        ) {
          result.set(de.to, 2);
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
): Tier {
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

const BIRTHDAY_PLACEHOLDER_YEAR = 2000;

type Tier = 0 | 1 | 2 | 3 | 4;

function maskBirthdayYear(birthday: string): string {
  const parts = birthday.split("-");
  return `${BIRTHDAY_PLACEHOLDER_YEAR}-${parts[1]}-${parts[2]}`;
}

export function applyVisibility(person: any, tier: Tier): any {
  if (tier === 4) return null; // not visible

  // Target's "Stay private from linked families" preference (UI label; DB
  // column is `confirmedMembersOnly`): when set, viewers in a different,
  // linked family unit who aren't already treated as tier 0/1/2 (see the
  // cross-unit branch of computeTier) are dropped entirely instead of
  // getting the tier-3 name/photo/relationship-only view. Tier 0/1/2 are
  // never affected by this toggle — tier 2's reduced view is unconditional
  // and controlled separately by `tier2ContactField`.
  if (person.confirmedMembersOnly && tier === 3) return null;

  // Base visible fields for all tiers
  const base: any = {
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    relationshipLabel: person.relationshipLabel,
    gender: person.gender ?? null,
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
      hideInstagram: person.hideInstagram,
      hideFacebook: person.hideFacebook,
      hideTiktok: person.hideTiktok,
      hideLinkedin: person.hideLinkedin,
      hideSnapchat: person.hideSnapchat,
      hideVenmo: person.hideVenmo,
      hideBereal: person.hideBereal,
      hideOtherSocial: person.hideOtherSocial,
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
      if (person.hideInstagram) full.instagram = null;
      if (person.hideFacebook) full.facebook = null;
      if (person.hideTiktok) full.tiktok = null;
      if (person.hideLinkedin) full.linkedin = null;
      if (person.hideSnapchat) full.snapchat = null;
      if (person.hideVenmo) full.venmo = null;
      if (person.hideBereal) full.bereal = null;
      if (person.hideOtherSocial) full.otherSocial = null;
      if (!person.showBirthYear && full.birthday) {
        full.birthday = maskBirthdayYear(full.birthday);
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
      birthday: person.birthday && !person.showBirthYear ? maskBirthdayYear(person.birthday) : person.birthday,
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
